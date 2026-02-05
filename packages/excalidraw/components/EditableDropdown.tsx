import React, { useState, useRef, useEffect, useCallback } from "react";
import { KEYS } from "@excalidraw/common";
import { useOutsideClick } from "../hooks/useOutsideClick";
import "./EditableDropdown.scss";

interface EditableDropdownProps {
  value: number | string;
  options: (number | string)[];
  onChange: (value: number) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
}

export const EditableDropdown: React.FC<EditableDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder = "",
  min = 1,
  max = 999,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track if option was just clicked to skip blur submit
  const justClickedOptionRef = useRef(false);

  // Sync input value when external value changes
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  // Close dropdown when clicking outside
  useOutsideClick(containerRef, () => {
    setIsOpen(false);
  });

  const handleSubmit = useCallback(() => {
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && numValue >= min && numValue <= max) {
      onChange(numValue);
    } else {
      // Reset to original value if invalid
      setInputValue(String(value));
    }
    setIsOpen(false);
  }, [inputValue, min, max, onChange, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEYS.ENTER) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === KEYS.ESCAPE) {
      e.preventDefault();
      setInputValue(String(value));
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === KEYS.ARROW_DOWN) {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
    }
  };

  const handleOptionClick = (option: number | string) => {
    const numValue = typeof option === "string" ? parseFloat(option) : option;
    // Mark that option was clicked to prevent blur from submitting stale value
    justClickedOptionRef.current = true;
    onChange(numValue);
    setInputValue(String(numValue));
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    inputRef.current?.select();
  };

  const handleInputBlur = () => {
    // Delay to allow option click to register
    setTimeout(() => {
      // Skip submit if option was just clicked (it already called onChange)
      if (justClickedOptionRef.current) {
        justClickedOptionRef.current = false;
        return;
      }
      if (!containerRef.current?.contains(document.activeElement)) {
        handleSubmit();
      }
    }, 150);
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
    if (!isOpen) {
      inputRef.current?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`editable-dropdown ${className}`}
    >
      <div className="editable-dropdown__input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="editable-dropdown__input"
        />
        <button
          type="button"
          className="editable-dropdown__toggle"
          onClick={toggleDropdown}
          tabIndex={-1}
        >
          <svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            fill="none"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          >
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="editable-dropdown__menu">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`editable-dropdown__option ${
                String(option) === String(value) ? "editable-dropdown__option--active" : ""
              }`}
              onMouseDown={(e) => {
                // Prevent input blur
                e.preventDefault();
                handleOptionClick(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EditableDropdown;
