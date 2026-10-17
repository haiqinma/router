import React, { Suspense, lazy, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppFilterHeader, AppSpin } from '../../router-ui';
import SectionTabs from '../../components/SectionTabs';
import './BillingFinance.css';

const BillingOverviewPage = lazy(() => import('./overview'));
const BillingProcurementReportPage = lazy(() => import('./procurement'));
const BillingReconciliationPage = lazy(() => import('./reconciliation'));
const FinanceRecordsPage = lazy(() => import('./records'));

// Single finance shell: finance results, accounting details, reconciliation,
// and cash records share one stable route.
// `/admin/finance?tab=...` so switching a tab only changes the query string —
// the tab strip stays mounted and the body swaps in place instead of tearing
// down a whole route (the old cross-route SectionTabs behavior).
const TABS = [
  { key: 'overview', labelKey: 'billing.overview.title' },
  { key: 'accounting', labelKey: 'billing.accounting.title' },
  { key: 'reconciliation', labelKey: 'billing.reconciliation.title' },
  { key: 'records', labelKey: 'billing.records.title' },
];

const VALID_TABS = new Set(TABS.map((tab) => tab.key));
const LEGACY_TAB_MAP = { profit: 'accounting', procurement: 'accounting' };

// Resolve the source tab of a drill-down's `return_to`, tolerant of both the
// new `?tab=` form and the legacy `/admin/finance/<seg>` pathname form so the
// return crumb keeps working across the migration.
const returnToTab = (returnTo) => {
  if (!returnTo) return null;
  const qIndex = returnTo.indexOf('?');
  const query = qIndex >= 0 ? returnTo.slice(qIndex + 1) : '';
  const fromQuery = new URLSearchParams(query).get('tab');
  const normalizedQueryTab = LEGACY_TAB_MAP[fromQuery] || fromQuery;
  if (normalizedQueryTab && VALID_TABS.has(normalizedQueryTab)) {
    return normalizedQueryTab;
  }
  const path = qIndex >= 0 ? returnTo.slice(0, qIndex) : returnTo;
  const seg = path.split('/').filter(Boolean).pop();
  const normalizedSegment = LEGACY_TAB_MAP[seg] || seg;
  if (normalizedSegment && VALID_TABS.has(normalizedSegment)) {
    return normalizedSegment;
  }
  return null;
};

const FinanceLayout = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_TABS.has(LEGACY_TAB_MAP[rawTab] || rawTab)
    ? LEGACY_TAB_MAP[rawTab] || rawTab
    : 'overview';

  useEffect(() => {
    const mappedTab = LEGACY_TAB_MAP[rawTab];
    if (!mappedTab) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', mappedTab);
    navigate(`/admin/finance?${next.toString()}`, { replace: true });
  }, [navigate, rawTab, searchParams]);

  const renderActive = () => {
    switch (activeTab) {
      case 'accounting':
        return <BillingProcurementReportPage embedded />;
      case 'reconciliation':
        return <BillingReconciliationPage />;
      case 'records':
        return <FinanceRecordsPage />;
      case 'overview':
      default:
        return <BillingOverviewPage embedded />;
    }
  };

  const activeLabelKey =
    TABS.find((tab) => tab.key === activeTab)?.labelKey || 'billing.overview.title';

  // When arriving via a drill-down, surface a clickable crumb back to the source
  // tab (with its own filters intact); pair it with the active crumb so the back
  // link has context. Absent a drill-down we render no breadcrumb at all — the tab
  // strip below is the sole "where am I" signal (matches the other admin shells).
  const returnTo = searchParams.get('return_to');
  const sourceTab = returnToTab(returnTo);
  const breadcrumbs =
    sourceTab && sourceTab !== activeTab
      ? [
          {
            key: `return-${sourceTab}`,
            label: t(TABS.find((tab) => tab.key === sourceTab)?.labelKey),
            onClick: () => navigate(returnTo),
          },
          { key: activeTab, label: t(activeLabelKey), active: true },
        ]
      : undefined;

  return (
    <div className='dashboard-container billing-finance-page'>
      <AppFilterHeader
        breadcrumbs={breadcrumbs}
        query={
          <SectionTabs
            active={activeTab}
            tabs={TABS.map((tab) => ({
              key: tab.key,
              label: t(tab.labelKey),
              to: `/admin/finance?tab=${tab.key}`,
            }))}
          />
        }
      />
      <Suspense fallback={<AppSpin spinning />}>{renderActive()}</Suspense>
    </div>
  );
};

export default FinanceLayout;
