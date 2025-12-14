import Dashboard from './pages/Dashboard';
import BuyerPerformance from './pages/BuyerPerformance';
import SupplierPerformance from './pages/SupplierPerformance';
import AllLeads from './pages/AllLeads';
import AdMetrics from './pages/AdMetrics';
import ActiveStates from './pages/ActiveStates';
import Rejections from './pages/Rejections';
import Returns from './pages/Returns';
import Verticals from './pages/Verticals';
import Buyers from './pages/Buyers';
import Suppliers from './pages/Suppliers';
import Sources from './pages/Sources';
import Brands from './pages/Brands';
import ManageStates from './pages/ManageStates';
import CreateReport from './pages/CreateReport';
import SavedReports from './pages/SavedReports';
import Analytics from './pages/Analytics';
import Billing from './pages/Billing';
import Profile from './pages/Profile';
import CompanySettings from './pages/CompanySettings';
import ThemeSettings from './pages/ThemeSettings';
import NotificationSettings from './pages/NotificationSettings';
import IntegrationSettings from './pages/IntegrationSettings';
import SecuritySettings from './pages/SecuritySettings';
import AdminSettings from './pages/AdminSettings';
import DataSyncSources from './pages/DataSyncSources';
import WidgetBuilder from './pages/WidgetBuilder';
import MetricsLibrary from './pages/MetricsLibrary';
import DebugWidget from './pages/DebugWidget';
import DebugData from './pages/DebugData';
import EditCloudRunSync from './pages/EditCloudRunSync';
import EditBigQuerySync from './pages/EditBigQuerySync';
import DashboardConfig from './pages/DashboardConfig';
import ApiWebhooks from './pages/ApiWebhooks';
import UserManagement from './pages/UserManagement';
import Notifications from './pages/Notifications';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "BuyerPerformance": BuyerPerformance,
    "SupplierPerformance": SupplierPerformance,
    "AllLeads": AllLeads,
    "AdMetrics": AdMetrics,
    "ActiveStates": ActiveStates,
    "Rejections": Rejections,
    "Returns": Returns,
    "Verticals": Verticals,
    "Buyers": Buyers,
    "Suppliers": Suppliers,
    "Sources": Sources,
    "Brands": Brands,
    "ManageStates": ManageStates,
    "CreateReport": CreateReport,
    "SavedReports": SavedReports,
    "Analytics": Analytics,
    "Billing": Billing,
    "Profile": Profile,
    "CompanySettings": CompanySettings,
    "ThemeSettings": ThemeSettings,
    "NotificationSettings": NotificationSettings,
    "IntegrationSettings": IntegrationSettings,
    "SecuritySettings": SecuritySettings,
    "AdminSettings": AdminSettings,
    "DataSyncSources": DataSyncSources,
    "WidgetBuilder": WidgetBuilder,
    "MetricsLibrary": MetricsLibrary,
    "DebugWidget": DebugWidget,
    "DebugData": DebugData,
    "EditCloudRunSync": EditCloudRunSync,
    "EditBigQuerySync": EditBigQuerySync,
    "DashboardConfig": DashboardConfig,
    "ApiWebhooks": ApiWebhooks,
    "UserManagement": UserManagement,
    "Notifications": Notifications,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};