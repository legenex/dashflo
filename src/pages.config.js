import ActiveStates from './pages/ActiveStates';
import AdMetrics from './pages/AdMetrics';
import AdminSettings from './pages/AdminSettings';
import AllLeads from './pages/AllLeads';
import Analytics from './pages/Analytics';
import ApiWebhooks from './pages/ApiWebhooks';
import Billing from './pages/Billing';
import Brands from './pages/Brands';
import BuyerPerformance from './pages/BuyerPerformance';
import Buyers from './pages/Buyers';
import CompanySettings from './pages/CompanySettings';
import CreateReport from './pages/CreateReport';
import Dashboard from './pages/Dashboard';
import DashboardConfig from './pages/DashboardConfig';
import DataSyncSources from './pages/DataSyncSources';
import DebugData from './pages/DebugData';
import DebugWidget from './pages/DebugWidget';
import EditBigQuerySync from './pages/EditBigQuerySync';
import EditCloudRunSync from './pages/EditCloudRunSync';
import Home from './pages/Home';
import IntegrationSettings from './pages/IntegrationSettings';
import ManageStates from './pages/ManageStates';
import MetricsLibrary from './pages/MetricsLibrary';
import NotificationSettings from './pages/NotificationSettings';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Rejections from './pages/Rejections';
import Returns from './pages/Returns';
import SavedReports from './pages/SavedReports';
import SecuritySettings from './pages/SecuritySettings';
import Sources from './pages/Sources';
import SupplierPerformance from './pages/SupplierPerformance';
import Suppliers from './pages/Suppliers';
import ThemeSettings from './pages/ThemeSettings';
import UserManagement from './pages/UserManagement';
import Verticals from './pages/Verticals';
import WidgetBuilder from './pages/WidgetBuilder';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActiveStates": ActiveStates,
    "AdMetrics": AdMetrics,
    "AdminSettings": AdminSettings,
    "AllLeads": AllLeads,
    "Analytics": Analytics,
    "ApiWebhooks": ApiWebhooks,
    "Billing": Billing,
    "Brands": Brands,
    "BuyerPerformance": BuyerPerformance,
    "Buyers": Buyers,
    "CompanySettings": CompanySettings,
    "CreateReport": CreateReport,
    "Dashboard": Dashboard,
    "DashboardConfig": DashboardConfig,
    "DataSyncSources": DataSyncSources,
    "DebugData": DebugData,
    "DebugWidget": DebugWidget,
    "EditBigQuerySync": EditBigQuerySync,
    "EditCloudRunSync": EditCloudRunSync,
    "Home": Home,
    "IntegrationSettings": IntegrationSettings,
    "ManageStates": ManageStates,
    "MetricsLibrary": MetricsLibrary,
    "NotificationSettings": NotificationSettings,
    "Notifications": Notifications,
    "Profile": Profile,
    "Rejections": Rejections,
    "Returns": Returns,
    "SavedReports": SavedReports,
    "SecuritySettings": SecuritySettings,
    "Sources": Sources,
    "SupplierPerformance": SupplierPerformance,
    "Suppliers": Suppliers,
    "ThemeSettings": ThemeSettings,
    "UserManagement": UserManagement,
    "Verticals": Verticals,
    "WidgetBuilder": WidgetBuilder,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};