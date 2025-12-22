import React from "react";
import type { RoleType } from "../types";

export const RoleContext = React.createContext<RoleType>("teacher");

export const useRole = () => React.useContext(RoleContext);
