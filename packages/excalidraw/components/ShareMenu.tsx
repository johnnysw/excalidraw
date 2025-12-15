import React from "react";
import { Icon } from "@iconify/react";

import "./ShareMenu.scss";

export const ShareMenu: React.FC = () => {
  return (
    <div className="ShareMenu">
      <div className="ShareMenu__content">
        <Icon
          icon="hugeicons:share-08"
          width={48}
          height={48}
          style={{ color: "#9ca3af", marginBottom: 12 }}
        />
        <p>分享功能</p>
        <p className="ShareMenu__hint">即将推出...</p>
      </div>
    </div>
  );
};
