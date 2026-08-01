import React, { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DoubleLeftOutlined, DoubleRightOutlined } from '@ant-design/icons';
import Footer from '../components/Footer';
import Header from '../components/Header';
import AdminSidebar from '../components/AdminSidebar';
import { AppButton, AppSider } from '../router-ui';

const USER_SIDEBAR_COMPACT_STORAGE_KEY = 'router_user_sidebar_compact_v1';

const UserWorkspaceLayout = () => {
  const { t } = useTranslation();
  const initialCompact = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const raw = (localStorage.getItem(USER_SIDEBAR_COMPACT_STORAGE_KEY) || '')
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true';
  }, []);
  const [sidebarCompact, setSidebarCompact] = useState(initialCompact);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(
      USER_SIDEBAR_COMPACT_STORAGE_KEY,
      sidebarCompact ? '1' : '0',
    );
  }, [sidebarCompact]);

  return (
    <>
      <Header workspace='user' hideNavButtons />
      <div className={`router-admin-shell ${sidebarCompact ? 'compact' : ''}`}>
        <AppSider
          className={`router-admin-sidebar ${sidebarCompact ? 'compact' : ''}`}
          width={248}
          collapsedWidth={84}
          collapsed={sidebarCompact}
        >
          <div className='router-admin-sidebar-scroll'>
            <AdminSidebar compact={sidebarCompact} />
          </div>
          <AppButton
            type='button'
            basic
            size='small'
            className='router-admin-divider-toggle'
            title={
              sidebarCompact
                ? t('header.sidebar_expand')
                : t('header.sidebar_compact')
            }
            aria-label={
              sidebarCompact
                ? t('header.sidebar_expand')
                : t('header.sidebar_compact')
            }
            onClick={() => setSidebarCompact((previous) => !previous)}
            icon={
              sidebarCompact ? <DoubleRightOutlined /> : <DoubleLeftOutlined />
            }
          />
        </AppSider>
        <div className='main-content router-admin-main'>
          <Outlet />
        </div>
      </div>
      <Footer />
    </>
  );
};

export default UserWorkspaceLayout;
