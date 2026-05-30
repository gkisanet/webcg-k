import React, { useState, useEffect, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface NumberInputProps {
    value: number | undefined;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
    step?: number;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
}

export function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
    className = "",
    placeholder,
    disabled = false,
}: NumberInputProps) {
    const [localValue, setLocalValue] = useState<string>("");
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startVal = useRef(0);

    // 1단계: 외부 value 프로퍼티 변경 시 동기화 (포커싱 중이 아닐 때만)
    useEffect(() => {
        if (!isFocused) {
            setLocalValue(value !== undefined && !isNaN(value) ? String(value) : "");
        }
    }, [value, isFocused]);

    // 2단계: 값 검증 및 부모 컴포넌트 통보
    const commitValue = (valStr: string) => {
        let parsed = parseFloat(valStr);
        if (isNaN(parsed)) {
            parsed = 0;
        }
        if (min !== undefined) parsed = Math.max(min, parsed);
        if (max !== undefined) parsed = Math.min(max, parsed);
        
        // 정밀도 이슈 해결을 위해 step 크기에 맞춰 반올림
        const decimalPlaces = (step.toString().split(".")[1] || "").length;
        parsed = parseFloat(parsed.toFixed(decimalPlaces));

        onChange(parsed);
        setLocalValue(String(parsed));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalValue(val);

        // 사용자가 타이핑 중에도 유효한 숫자라면 실시간 업데이트 수행 (UX 향상)
        // 단, "-", ".", 빈 문자열 등 임시 상태일 때는 부모 상태를 망가뜨리지 않도록 통보 보류
        if (val !== "" && val !== "-" && !val.endsWith(".")) {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
                let clamped = parsed;
                if (min !== undefined) clamped = Math.max(min, clamped);
                if (max !== undefined) clamped = Math.min(max, clamped);
                onChange(clamped);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            commitValue(localValue);
            inputRef.current?.blur();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            adjustValue(e.shiftKey ? step * 10 : step);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            adjustValue(e.shiftKey ? -step * 10 : -step);
        }
    };

    const handleBlur = () => {
        setIsFocused(false);
        commitValue(localValue);
    };

    // 3단계: 값 증감 유틸리티
    const adjustValue = (amount: number) => {
        const current = parseFloat(localValue) || 0;
        let next = current + amount;
        if (min !== undefined) next = Math.max(min, next);
        if (max !== undefined) next = Math.min(max, next);

        const decimalPlaces = (step.toString().split(".")[1] || "").length;
        next = parseFloat(next.toFixed(decimalPlaces));

        setLocalValue(String(next));
        onChange(next);
    };

    // 4단계: 드래그 스크러버(Scrubber) 인터랙션 구현
    const handleMouseDown = (e: React.MouseEvent) => {
        if (disabled) return;
        e.preventDefault(); // 인풋에 포커스가 뺏기지 않도록 함
        isDragging.current = true;
        startY.current = e.clientY;
        startVal.current = parseFloat(localValue) || 0;

        document.body.style.cursor = "ns-resize";
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        const diffY = startY.current - e.clientY; // 마우스 위로 끌면 수치 증가
        const scale = e.shiftKey ? step * 10 : step;
        
        // 5픽셀 당 1스텝씩 증감되도록 감도(Sensitivity) 조절
        const stepCount = Math.round(diffY / 5);
        let next = startVal.current + stepCount * scale;
        
        if (min !== undefined) next = Math.max(min, next);
        if (max !== undefined) next = Math.min(max, next);

        const decimalPlaces = (step.toString().split(".")[1] || "").length;
        next = parseFloat(next.toFixed(decimalPlaces));

        setLocalValue(String(next));
        onChange(next);
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "default";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
    };

    return (
        <div className={`relative flex items-center group number-input-wrapper ${className}`}>
            <input
                ref={inputRef}
                type="text"
                className="ins-input w-full pr-6 select-all"
                value={localValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
                placeholder={placeholder}
                disabled={disabled}
                style={{
                    appearance: "none",
                    MozAppearance: "textfield",
                }}
            />
            {/* 조절용 마우스 화살표 및 드래그 핸들 존 */}
            <div 
                className="absolute right-1 top-0 bottom-0 flex flex-col justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[var(--text-secondary)] select-none h-full w-5"
                style={{ cursor: "ns-resize" }}
                onMouseDown={handleMouseDown}
            >
                <button
                    type="button"
                    tabIndex={-1}
                    className="hover:text-white p-0 h-3 flex items-center justify-center text-[10px] focus:outline-none"
                    onClick={(e) => {
                        e.stopPropagation();
                        adjustValue(e.shiftKey ? step * 10 : step);
                    }}
                >
                    <ChevronUp className="w-3 h-3 stroke-[2.5]" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    className="hover:text-white p-0 h-3 flex items-center justify-center text-[10px] focus:outline-none"
                    onClick={(e) => {
                        e.stopPropagation();
                        adjustValue(e.shiftKey ? -step * 10 : -step);
                    }}
                >
                    <ChevronDown className="w-3 h-3 stroke-[2.5]" />
                </button>
            </div>
        </div>
    );
}
