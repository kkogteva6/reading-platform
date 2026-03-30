import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getUser } from "./auth";

export default function Protected() {
  const user = getUser();
  const loc = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}
