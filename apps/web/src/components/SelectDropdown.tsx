import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface Option {
    label: string;
    value: string;
}

interface SelectDropdownProps {
    options: Option[];
    value: string | null;
    onChange: (value: string) => void;
    placeholder?: string;
}

interface DropdownPosition {
    top: number;
    left: number;
    width: number;
}

export default function SelectDropdown({
    options,
    value,
    onChange,
    placeholder = "Select option",
}: SelectDropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLUListElement>(null);
    const [position, setPosition] = useState<DropdownPosition | null>(null);

    const selected = options.find((o) => o.value === value);

    const updatePosition = () => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        setPosition({
            top: rect.bottom + 8,
            left: rect.left,
            width: rect.width,
        });
    };

    // close when click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                ref.current &&
                !ref.current.contains(target) &&
                menuRef.current &&
                !menuRef.current.contains(target)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useLayoutEffect(() => {
        if (!open) return;

        updatePosition();

        const handleViewportChange = () => updatePosition();
        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);

        return () => {
            window.removeEventListener("resize", handleViewportChange);
            window.removeEventListener("scroll", handleViewportChange, true);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            {/* Button */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`w-full rounded-lg border px-4 py-2.5 text-left flex justify-between items-center transition-all duration-200 focus:outline-none focus:border-brand-500/70 focus:ring-1 focus:ring-brand-500/30 ${open
                    ? "bg-surface-800 border-brand-500/70 shadow-lg shadow-brand-600/15"
                    : "bg-surface-800 border-surface-600/50 hover:border-surface-500/70"
                    }`}
            >
                <span className={selected ? "text-surface-100" : "text-surface-500"}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown className={`w-4 h-4 text-surface-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {open && position && createPortal(
                <ul
                    ref={menuRef}
                    style={{
                        position: "fixed",
                        top: position.top,
                        left: position.left,
                        width: position.width,
                    }}
                    className="z-[9999] max-h-64 overflow-y-auto rounded-xl border border-surface-600/60 bg-surface-900/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fadeIn"
                >
                    {options.map((option) => (
                        <li
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                            className={`rounded-lg px-4 py-3 cursor-pointer transition-colors duration-150
                                ${value === option.value
                                    ? "bg-brand-600/80 text-white shadow-lg shadow-brand-600/20"
                                    : "text-surface-200 hover:bg-surface-800 hover:text-surface-100"
                                }`}
                        >
                            {option.label}
                        </li>
                    ))}
                </ul>,
                document.body
            )}
        </div>
    );
}
