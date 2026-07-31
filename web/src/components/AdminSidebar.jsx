import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  buildUnifiedWorkspaceMenuGroups,
  isAdminRouteActive,
} from '../constants/adminMenu';
import { isUserRouteActive } from '../constants/userMenu';
import { isAdmin } from '../helpers';
import { AppIcon, AppNavMenu } from '../router-ui';

const SIDEBAR_GROUP_OPEN_STORAGE_KEY = 'router_admin_sidebar_group_open_v2';

const buildInitialOpenKeys = (menuItems) => {
  const defaults = menuItems.map((group) => group.key);
  if (typeof window === 'undefined') {
    return defaults;
  }
  const raw = (localStorage.getItem(SIDEBAR_GROUP_OPEN_STORAGE_KEY) || '').trim();
  if (raw === '') {
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return defaults;
    }
    const allowed = new Set(defaults);
    return parsed.filter((key) => allowed.has(key));
  } catch {
    return defaults;
  }
};

const AdminSidebar = ({ compact = false }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const menuItems = useMemo(() => buildUnifiedWorkspaceMenuGroups(isAdmin()), []);
  const [openKeys, setOpenKeys] = useState(() => buildInitialOpenKeys(menuItems));

  const isRouteActive = (to) =>
    String(to || '').startsWith('/admin/')
      ? isAdminRouteActive(location, to)
      : isUserRouteActive(location, to);

  const selectedKeys = useMemo(() => {
    const active = [];
    menuItems.forEach((group) => {
      group.items.forEach((item) => {
        if (isRouteActive(item.to)) {
          active.push(item.to);
        }
      });
    });
    return active;
  }, [location, menuItems]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(SIDEBAR_GROUP_OPEN_STORAGE_KEY, JSON.stringify(openKeys));
  }, [openKeys]);

  useEffect(() => {
    if (compact || selectedKeys.length === 0) {
      return;
    }
    const activeGroupKeys = menuItems.filter((group) =>
      group.items.some((item) => selectedKeys.includes(item.to)),
    ).map((group) => group.key);
    if (activeGroupKeys.length === 0) {
      return;
    }
    setOpenKeys((previous) => {
      const next = Array.from(new Set([...previous, ...activeGroupKeys]));
      return next.length === previous.length &&
        next.every((item, index) => item === previous[index])
        ? previous
        : next;
    });
  }, [compact, menuItems, selectedKeys]);

  const items = useMemo(
    () =>
      menuItems.map((group) => ({
        key: group.key,
        icon: <AppIcon name={group.icon} />,
        label: t(group.name),
        children: group.items.map((item) => ({
          key: item.to,
          icon: <AppIcon name={item.icon} />,
          label: t(item.name),
        })),
      })),
    [menuItems, t],
  );

  return (
    <AppNavMenu
      className='router-admin-nav-menu'
      mode='inline'
      inlineCollapsed={compact}
      triggerSubMenuAction={compact ? 'click' : 'hover'}
      items={items}
      selectedKeys={selectedKeys}
      {...(!compact
        ? {
            openKeys,
            onOpenChange: (nextKeys) => setOpenKeys(nextKeys),
          }
        : {})}
      onClick={({ key }) => {
        if (typeof key === 'string' && key.startsWith('/')) {
          navigate(key);
        }
      }}
    />
  );
};

export default AdminSidebar;
