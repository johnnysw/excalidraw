import React, { useEffect, useState } from "react";

import {
  ANIMATION_MAX_DURATION,
  ANIMATION_MIN_DURATION,
  normalizeAnimationDuration,
} from "./animationPlayback";

interface DurationInputProps {
  value: number;
  onCommit: (duration: number) => void;
}

export const DurationInput = ({ value, onCommit }: DurationInputProps) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const duration = normalizeAnimationDuration(
      draft === "" ? undefined : Number(draft),
    );
    setDraft(String(duration));
    if (duration !== value) {
      onCommit(duration);
    }
  };

  return (
    <div className="AnimationMenu__duration-input">
      <input
        type="number"
        min={ANIMATION_MIN_DURATION}
        max={ANIMATION_MAX_DURATION}
        step={100}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(value));
          }
        }}
      />
      <span>ms</span>
    </div>
  );
};
