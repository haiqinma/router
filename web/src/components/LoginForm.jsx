import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { StatusContext } from '../context/Status';
import { API, showError } from '../helpers';
import { toastConstants } from '../constants';
import {
  focusWalletPendingApproval,
  isWalletIdentityAvatarUnavailableError,
  isWalletIdentityEmailRequiredError,
  isWalletUserRejectedError,
  loginWithWallet,
  loginWithWalletWithoutAvatar,
} from '../services/web3Auth';
import { useWalletProviderStatus } from '../hooks/useWalletProviderStatus';
import {
  AppAlert,
  AppButton,
  AppIcon,
  AppQRCode,
  AppSpin,
} from '../router-ui';
import {
  rememberAuthRedirectPath,
  resolvePostLoginPath,
} from '../helpers/authRedirect';
import './LoginForm.css';

const LoginForm = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [, userDispatch] = useContext(UserContext);
  const [statusState] = useContext(StatusContext);
  const navigate = useNavigate();
  const storedStatus = (() => {
    const raw = localStorage.getItem('status');
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return undefined;
    }
  })();
  const status = statusState?.status || storedStatus || {};
  const walletLoginDisabled = status?.wallet_login === false;
  const walletLoginEnabled = !walletLoginDisabled;
  const [walletLoginSubmitting, setWalletLoginSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState('wallet');
  const [walletLoginAwaitingApproval, setWalletLoginAwaitingApproval] =
    useState(false);
  const walletLoginPromiseRef = useRef(null);
  const identityPollTimerRef = useRef(null);
  const identitySuccessTimerRef = useRef(null);
  const identitySessionRef = useRef('');
  const [identityLogin, setIdentityLogin] = useState({
    loading: false,
    verifyUrl: '',
    message: '',
    success: false,
  });
  const walletProviderStatus = useWalletProviderStatus();
  const resolveLandingPath = (role) =>
    Number(role) >= 10 ? '/admin/dashboard' : '/workspace/entry';

  useEffect(() => {
    rememberAuthRedirectPath(searchParams.get('redirect'));
  }, [searchParams]);

  useEffect(() => {
    const expiredMarker = searchParams.get('expired');
    if (expiredMarker) {
      const lastMarker = sessionStorage.getItem('last_login_expired_marker');
      if (lastMarker !== expiredMarker) {
        sessionStorage.setItem('last_login_expired_marker', expiredMarker);
        showError(t('messages.error.login_expired'), {
          autoClose: Math.floor(toastConstants.ERROR_TIMEOUT / 2),
        });
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('expired');
      const nextSearch = nextParams.toString();
      navigate(`/login${nextSearch ? `?${nextSearch}` : ''}`, {
        replace: true,
      });
      return;
    }
  }, [searchParams, t, navigate]);

  useEffect(
    () => () => {
      if (identityPollTimerRef.current) {
        window.clearInterval(identityPollTimerRef.current);
      }
      if (identitySuccessTimerRef.current) {
        window.clearTimeout(identitySuccessTimerRef.current);
      }
    },
    []
  );

  const finishIdentityLogin = (user) => {
    if (!user) {
      showError(t('auth.login.user_fetch_failed'));
      return;
    }
    if (identityPollTimerRef.current) {
      window.clearInterval(identityPollTimerRef.current);
      identityPollTimerRef.current = null;
    }
    setIdentityLogin({
      loading: false,
      verifyUrl: '',
      message: '',
      success: true,
    });
    identitySuccessTimerRef.current = window.setTimeout(() => {
      identitySuccessTimerRef.current = null;
      userDispatch({ type: 'login', payload: user });
      localStorage.setItem('user', JSON.stringify(user));
      navigate(
        resolvePostLoginPath(searchParams, resolveLandingPath(user.role)),
        { replace: true }
      );
    }, 900);
  };

  const pollIdentityLogin = async () => {
    const sessionId = identitySessionRef.current;
    if (!sessionId) return;
    try {
      const response = await API.get(
        '/api/v1/public/auth/identity/passkey/login/status',
        { params: { session_id: sessionId } }
      );
      const payload = response?.data || {};
      if (!payload.success) {
        setIdentityLogin((current) => ({
          ...current,
          loading: false,
          message: payload.message || t('auth.login.identity_failed'),
        }));
        return;
      }
      const result = payload.data || {};
      if (result.status === 'complete') {
        finishIdentityLogin(result.user);
        return;
      }
      if (['expired', 'failed', 'unbound'].includes(result.status)) {
        if (identityPollTimerRef.current)
          window.clearInterval(identityPollTimerRef.current);
        identityPollTimerRef.current = null;
        setIdentityLogin((current) => ({
          ...current,
          loading: false,
          message: result.message || t(`auth.login.identity_${result.status}`),
        }));
      }
    } catch (error) {
      setIdentityLogin((current) => ({
        ...current,
        loading: false,
        message: error.message || t('auth.login.identity_failed'),
      }));
    }
  };

  const startIdentityLogin = async () => {
    if (identityLogin.loading) return;
    if (identitySuccessTimerRef.current) {
      window.clearTimeout(identitySuccessTimerRef.current);
      identitySuccessTimerRef.current = null;
    }
    setIdentityLogin({
      loading: true,
      verifyUrl: '',
      message: '',
      success: false,
    });
    try {
      let response;
      try {
        response = await API.post(
          '/api/v1/public/auth/identity/passkey/login/session',
          { avatar: true }
        );
      } catch (error) {
        if (!isWalletIdentityAvatarUnavailableError(error)) {
          throw error;
        }
        response = await API.post(
          '/api/v1/public/auth/identity/passkey/login/session',
          { avatar: false }
        );
      }
      const payload = response?.data || {};
      if (
        !payload.success &&
        isWalletIdentityAvatarUnavailableError(payload.message)
      ) {
        response = await API.post(
          '/api/v1/public/auth/identity/passkey/login/session',
          { avatar: false }
        );
      }
      const finalPayload = response?.data || {};
      if (
        !finalPayload.success ||
        !finalPayload.data?.session_id ||
        !finalPayload.data?.verify_url
      ) {
        throw new Error(finalPayload.message || t('auth.login.identity_failed'));
      }
      identitySessionRef.current = finalPayload.data.session_id;
      setIdentityLogin({
        loading: false,
        verifyUrl: finalPayload.data.verify_url,
        message: '',
        success: false,
      });
      await pollIdentityLogin();
      identityPollTimerRef.current = window.setInterval(
        pollIdentityLogin,
        (Number(finalPayload.data.poll_interval) || 2) * 1000
      );
    } catch (error) {
      setIdentityLogin({
        loading: false,
        verifyUrl: '',
        message: error.message || t('auth.login.identity_failed'),
        success: false,
      });
    }
  };

  const closeIdentityLogin = () => {
    if (identityPollTimerRef.current)
      window.clearInterval(identityPollTimerRef.current);
    identityPollTimerRef.current = null;
    if (identitySuccessTimerRef.current) {
      window.clearTimeout(identitySuccessTimerRef.current);
      identitySuccessTimerRef.current = null;
    }
    identitySessionRef.current = '';
    setIdentityLogin({
      loading: false,
      verifyUrl: '',
      message: '',
      success: false,
    });
  };

  const toggleAuthMode = () => {
    if (authMode === 'identity') {
      closeIdentityLogin();
      setAuthMode('wallet');
      return;
    }
    setAuthMode('identity');
    startIdentityLogin();
  };

  useEffect(() => {
    const refresh = () => pollIdentityLogin();
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('router-identity-login');
    if (channel) channel.onmessage = refresh;
    window.addEventListener('storage', refresh);
    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const onWalletLoginClicked = async () => {
    if (walletLoginSubmitting) {
      return;
    }
    if (walletLoginPromiseRef.current) {
      const provider =
        walletProviderStatus.provider || (await walletProviderStatus.refresh());
      const pending = await focusWalletPendingApproval(provider || undefined);
      if (!pending?.focused) {
        showError(t('auth.login.wallet_pending_retry'));
      }
      return;
    }

    setWalletLoginSubmitting(true);
    try {
      if (status?.wallet_login === false) {
        showError(t('auth.login.wallet_disabled') || '钱包登录未开启');
        return;
      }
      await walletProviderStatus.refresh();
      setWalletLoginAwaitingApproval(true);
      const loginTask = loginWithWallet();
      walletLoginPromiseRef.current = loginTask;
      setWalletLoginSubmitting(false);
      let loginResult;
      try {
        loginResult = await loginTask;
      } catch (error) {
        if (!isWalletIdentityAvatarUnavailableError(error)) {
          throw error;
        }
        const fallbackTask = loginWithWalletWithoutAvatar();
        walletLoginPromiseRef.current = fallbackTask;
        loginResult = await fallbackTask;
      }
      setWalletLoginAwaitingApproval(false);
      const payload = loginResult?.response?.data || loginResult?.response;
      if (payload?.expiresAt) {
        localStorage.setItem(
          'wallet_token_expires_at',
          new Date(payload.expiresAt).toISOString()
        );
      }
      const selfResp = await API.get('/api/v1/public/user/self');
      const { success, data, message } = selfResp?.data || {};
      if (!success || !data) {
        showError(message || t('auth.login.user_fetch_failed'));
        return;
      }
      const userData = { ...data, token: loginResult.token };
      userDispatch({ type: 'login', payload: userData });
      localStorage.setItem('user', JSON.stringify(userData));
      navigate(
        resolvePostLoginPath(searchParams, resolveLandingPath(userData.role)),
        { replace: true }
      );
    } catch (error) {
      setWalletLoginAwaitingApproval(false);
      if (isWalletUserRejectedError(error)) {
        showError(t('auth.login.wallet_rejected'));
      } else if (isWalletIdentityEmailRequiredError(error)) {
        showError(t('auth.login.wallet_identity_email_required'));
      } else {
        showError(error.message || t('auth.login.wallet_failed'));
      }
    } finally {
      walletLoginPromiseRef.current = null;
      setWalletLoginSubmitting(false);
    }
  };

  return (
    <div className='router-login-page'>
      <main className='router-login-layout'>
        <section className='router-login-auth' aria-labelledby='login-title'>
          <div className='router-login-form-shell'>
            <div className='router-login-heading'>
              <h2 id='login-title'>
                {authMode === 'identity'
                  ? t('auth.login.identity_title')
                  : t('auth.login.wallet_title')}
              </h2>
              <p>
                {authMode === 'identity'
                  ? t('auth.login.identity_hint')
                  : t('auth.login.wallet_subtitle')}
              </p>
              <AppButton
                type='button'
                className='router-login-mode-switch'
                icon={
                  <AppIcon
                    name={authMode === 'identity' ? 'wallet' : 'qrcode'}
                  />
                }
                onClick={toggleAuthMode}
              >
                {authMode === 'identity'
                  ? t('auth.login.switch_to_wallet')
                  : t('auth.login.switch_to_identity')}
              </AppButton>
            </div>
            {authMode === 'wallet' && walletLoginEnabled ? (
              <>
                <div className='router-login-section'>
                  <div className='router-wallet-login-row'>
                    <AppButton
                      className='router-login-main-btn router-auth-button router-wallet-button'
                      onClick={onWalletLoginClicked}
                      disabled={
                        walletLoginDisabled ||
                        walletLoginSubmitting ||
                        (!walletProviderStatus.detecting &&
                          !walletProviderStatus.available)
                      }
                      loading={
                        walletLoginSubmitting || walletProviderStatus.detecting
                      }
                    >
                      {t('auth.login.wallet_action', '钱包登陆')}
                    </AppButton>
                  </div>
                  {!walletProviderStatus.detecting &&
                    !walletProviderStatus.available && (
                      <AppAlert
                        type='warning'
                        showIcon
                        className='router-auth-message'
                        title={t('auth.login.wallet_not_detected')}
                      />
                    )}
                </div>
              </>
            ) : null}
            {authMode === 'identity' ? (
              <div className='router-identity-login-panel'>
                {identityLogin.success ? (
                  <div className='router-identity-success'>
                    <AppIcon
                      name='check circle'
                      className='router-identity-success-icon'
                    />
                    <h3>{t('auth.login.identity_success_title')}</h3>
                    <p>{t('auth.login.identity_success_hint')}</p>
                    <AppSpin />
                  </div>
                ) : null}
                {!identityLogin.success && identityLogin.verifyUrl ? (
                  <AppQRCode value={identityLogin.verifyUrl} size={220} />
                ) : null}
                {!identityLogin.success && identityLogin.loading ? (
                  <p>{t('auth.login.identity_loading')}</p>
                ) : null}
                {!identityLogin.success && identityLogin.verifyUrl ? (
                  <a
                    className='router-identity-local-link'
                    href={identityLogin.verifyUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {t('auth.login.identity_open')}
                  </a>
                ) : null}
                {!identityLogin.success && identityLogin.message ? (
                  <>
                    <AppAlert
                      type='warning'
                      showIcon
                      title={identityLogin.message}
                    />
                    <AppButton onClick={startIdentityLogin}>
                      {t('auth.login.identity_refresh')}
                    </AppButton>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
};

export default LoginForm;
