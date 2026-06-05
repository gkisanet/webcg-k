/**
 * @rive-app/react-webgl2 타입 보강
 * v4.26.2에 런타임에 존재하지만 .d.ts에 누락된 훅의 TypeScript 선언
 */

declare module "@rive-app/react-webgl2" {
    import type { ComponentProps } from "react";

    // Rive 런타임 인스턴스 (생성자 + 인스턴스 메서드)
    export class Rive {
        constructor(options: UseRiveOptions & {
            canvas?: HTMLCanvasElement;
            buffer?: ArrayBuffer;
        });
        contents: any;
        viewModelCount: number;
        viewModelByIndex(i: number): any;
        viewModelByName(name: string): any;
        viewModelInstance: any;
        defaultViewModel(): any;
        enums(): any[];
        // 런타임 재생 제어
        play(animationNames?: string | string[], autoplay?: boolean): void;
        pause(animationNames?: string | string[]): void;
        reset(options?: { autoplay?: boolean }): void;
        cleanup(): void;
    }

    // ─── useRive 훅 ─────────────────────────────────────────
    interface UseRiveOptions {
        src?: string;
        buffer?: ArrayBuffer;
        artboard?: string;
        stateMachine?: string;
        stateMachines?: string | string[];
        autoplay?: boolean;
        autoBind?: boolean;
        automaticallyHandleEvents?: boolean;
        onLoad?: () => void;
        onLoadError?: () => void;
    }

    interface UseRiveReturn {
        rive: Rive | null;
        RiveComponent: React.ComponentType<ComponentProps<"canvas">>;
    }

    export function useRive(options: UseRiveOptions | undefined): UseRiveReturn;

    // ─── ViewModel 참조 ─────────────────────────────────────
    interface ViewModelRef {
        name: string;
        properties: Array<{ name: string; type: number }>;
    }

    interface UseViewModelOptions {
        name?: string;
        useDefault?: boolean;
    }

    // rive 인스턴스에서 ViewModel 참조를 가져오는 훅
    export function useViewModel(
        rive: Rive | null | undefined,
        options?: UseViewModelOptions,
    ): ViewModelRef | null;

    // ViewModel 참조로 인스턴스를 가져오는 훅
    export function useViewModelInstance(
        viewModel: ViewModelRef | null | undefined,
        options?: { rive?: Rive | null },
    ): any;

    // ─── 타입별 인스턴스 훅 ─────────────────────────────────
    export function useViewModelInstanceBoolean(
        name: string,
        instance: any,
    ): { value: boolean; setValue: (v: boolean) => void };

    export function useViewModelInstanceNumber(
        name: string,
        instance: any,
    ): { value: number; setValue: (v: number) => void };

    export function useViewModelInstanceString(
        name: string,
        instance: any,
    ): { value: string; setValue: (v: string) => void };

    export function useViewModelInstanceColor(
        name: string,
        instance: any,
    ): {
        value: number;
        setValue: (v: number) => void;
        setRgb: (r: number, g: number, b: number) => void;
    };

    export function useViewModelInstanceEnum(
        name: string,
        instance: any,
    ): { value: string; setValue: (v: string) => void; values: string[] };

    export function useViewModelInstanceTrigger(
        name: string,
        instance: any,
    ): { trigger: () => void };

    export function useViewModelInstanceList(
        name: string,
        instance: any,
    ): {
        length: number;
        addInstance: (vmi: any) => void;
        addInstanceAt: (vmi: any, index: number) => void;
        removeInstance: (vmi: any) => void;
        removeInstanceAt: (index: number) => void;
        getInstanceAt: (index: number) => any;
        swap: (a: number, b: number) => void;
    };

    export function useViewModelInstanceImage(
        name: string,
        instance: any,
    ): { value: (image: any) => void };

    export function useViewModelInstanceArtboard(
        name: string,
        instance: any,
    ): { value: (artboard: any) => void };
}
