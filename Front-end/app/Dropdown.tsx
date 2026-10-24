"use client";
import { useEffect, useRef, useState } from "react";

export type DropdownOption = {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: "ok" | "blue" | "warn";
  icon?: React.ReactNode;
};

type DropdownProps = {
  label?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
};

export default function Dropdown({
  label,
  options,
  value,
  onChange,
  align = "left",
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > 220) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleSelect(val: string) {
    onChange(val);
    setIsOpen(false);
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
    }
  }

  return (
    <div className="dropdown-container" ref={containerRef}>
      {label && <label className="dropdown-label">{label}</label>}
      <button
        type="button"
        className={`dropdown-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="dropdown-selected-text">
          {selectedOption?.icon && <span className="dropdown-opt-ic">{selectedOption.icon}</span>}
          <span>{selectedOption?.label}</span>
          {selectedOption?.badge && (
            <span className={`dropdown-badge ${selectedOption.badgeColor ?? "blue"}`}>
              {selectedOption.badge}
            </span>
          )}
        </span>
        <svg
          className={`dropdown-chevron ${isOpen ? "rotated" : ""}`}
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`dropdown-menu align-${align} ${openUpward ? "drop-up" : ""} popover-reveal`}
          role="listbox"
          tabIndex={-1}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`dropdown-item ${isSelected ? "selected" : ""}`}
                onClick={() => handleSelect(opt.value)}
              >
                <div className="dropdown-item-content">
                  <div className="dropdown-item-primary">
                    {opt.icon && <span className="dropdown-opt-ic">{opt.icon}</span>}
                    <span className="dropdown-item-title">{opt.label}</span>
                    {opt.badge && (
                      <span className={`dropdown-badge ${opt.badgeColor ?? "blue"}`}>
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  {opt.sublabel && <span className="dropdown-item-sub">{opt.sublabel}</span>}
                </div>
                {isSelected && (
                  <svg
                    className="dropdown-check"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
