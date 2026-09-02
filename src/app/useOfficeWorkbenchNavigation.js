import { useEffect, useState } from "react";
import {
  allNavigationItems,
  desktopRequiredMobilePage,
  getDefaultNavigationPage,
  getMobileViewportPage,
  isDedicatedMobileRolePage,
  isNavigationPageVisible,
  roleBoundaryPage,
} from "./navigation.js";

const mobileViewportQuery = "(max-width: 767px)";

export function resolveOfficeWorkbenchNavigation({
  activePage,
  mobileViewport,
  permissionContext,
}) {
  const defaultNavigationPage = getDefaultNavigationPage(permissionContext);
  const requestedPage = mobileViewport
    ? getMobileViewportPage(activePage, permissionContext)
    : activePage;
  const renderedPage = requestedPage === desktopRequiredMobilePage.key
    || isNavigationPageVisible(requestedPage, permissionContext)
    ? requestedPage
    : defaultNavigationPage;
  const activeMeta = allNavigationItems.find((item) => item.key === renderedPage)
    ?? roleBoundaryPage;
  const roleFocusedShellPage = isDedicatedMobileRolePage(renderedPage)
    || renderedPage === roleBoundaryPage.key
    || (mobileViewport && renderedPage === "rawMaterials");

  return {
    activeMeta,
    renderedPage,
    roleFocusedShellPage,
  };
}

export function useOfficeWorkbenchNavigation({ permissionContext }) {
  const [activePage, setActivePage] = useState("todos");
  const [mobileViewport, setMobileViewport] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(mobileViewportQuery).matches
  ));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!isNavigationPageVisible(activePage, permissionContext)) {
      setActivePage(getDefaultNavigationPage(permissionContext));
    }
  }, [activePage, permissionContext]);

  useEffect(() => {
    const media = window.matchMedia(mobileViewportQuery);
    const syncViewport = () => setMobileViewport(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  return {
    activePage,
    mobileViewport,
    setActivePage,
    setSidebarCollapsed,
    sidebarCollapsed,
    ...resolveOfficeWorkbenchNavigation({
      activePage,
      mobileViewport,
      permissionContext,
    }),
  };
}
