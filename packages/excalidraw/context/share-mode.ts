import React from "react";
import type { ShareModePermissions } from "../types";

export const ShareModeContext = React.createContext<ShareModePermissions | undefined>(undefined);

export const useShareMode = () => React.useContext(ShareModeContext);
