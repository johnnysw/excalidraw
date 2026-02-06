import React, { useRef, useState, useEffect } from "react";
import "./NumberInput.scss";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | ((value: number) => number);
  className?: string;
  style?: React.CSSProperties;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  className = "",
  style,
}) => {
  const [inputValue, setInputValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const getStep = (stepValue: number) =>
    typeof step === "function" ? step(stepValue) : step;

  const commitValue = (newValueStr: string) => {
    let newValue = parseFloat(newValueStr);
    if (isNaN(newValue)) {
      setInputValue(String(value));
      return;
    }

    // Clamp value
    newValue = Math.min(Math.max(newValue, min), max);

    // Round to step precision to avoid float issues
    const stepValue = getStep(newValue);
    const precision = stepValue.toString().split(".")[1]?.length || 0;
    newValue = parseFloat(newValue.toFixed(precision));

    onChange(newValue);
    setInputValue(String(newValue));
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      increment();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrement();
    }
  };

  const increment = () => {
    const currentValue = parseFloat(inputValue) || 0;
    const stepValue = getStep(currentValue);
    commitValue(String(currentValue + stepValue));
  };

  const decrement = () => {
    const currentValue = parseFloat(inputValue) || 0;
    const stepValue = getStep(currentValue - Number.EPSILON);
    commitValue(String(currentValue - stepValue));
  };

  return (
    <div
      className={`number-input ${className} ${isFocused ? "number-input--focused" : ""}`}
      style={style}
    >
      <input
        ref={inputRef}
        type="text" // Use text to completely bypass browser number input behaviors
        inputMode="decimal"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="number-input__field"
      />
      <div className="number-input__controls">
        <div
          className="number-input__button"
          onClick={(e) => {
            e.preventDefault();
            increment();
          }}
          role="button"
          tabIndex={-1}
        >
          <svg width="8" height="4" viewBox="0 0 8 4" fill="none">
            <path d="M1 3L4 1L7 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div
          className="number-input__button"
          onClick={(e) => {
            e.preventDefault();
            decrement();
          }}
          role="button"
          tabIndex={-1}
        >
          <svg width="8" height="4" viewBox="0 0 8 4" fill="none">
            <path d="M1 1L4 3L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
};
