import React, {
  HTMLAttributes,
  ReactElement,
  ReactNode,
  useEffect,
  useMemo,
  useRef
} from "react";

type ShapeKind = "rect" | "circle" | "triangle";

type ShapeDescriptor = {
  kind: ShapeKind;
  color: string;
};

type BaseShapeProps = {
  color: string;
};

interface ConfettiProps extends HTMLAttributes<HTMLDivElement> {
  total?: number;
  Component?: ReactNode | ReactNode[];
  colors?: string[];
  gravity?: number;
  wind?: number;
  speed?: number;
  recycle?: boolean;
}

const DEFAULT_COLORS = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"];
const SHAPES: ShapeKind[] = ["rect", "circle", "triangle"];

const style: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  zIndex: 1
};

function shapeElement(kind: ShapeKind, color: string): React.JSX.Element {
  return <span data-confetti-shape={kind} data-confetti-color={color} />;
}

export function Rectangle({ color }: BaseShapeProps): React.JSX.Element {
  return shapeElement("rect", color);
}

export function Circle({ color }: BaseShapeProps): React.JSX.Element {
  return shapeElement("circle", color);
}

export function Triangle({ color }: BaseShapeProps): React.JSX.Element {
  return shapeElement("triangle", color);
}

function isElement(value: ReactNode): value is ReactElement {
  return Boolean(value && typeof value === "object" && "type" in value);
}

function componentToDescriptor(value: ReactNode): ShapeDescriptor | null {
  if (!isElement(value)) return null;

  const props = value.props as Partial<BaseShapeProps>;
  if (value.type === Rectangle) return { kind: "rect", color: props.color ?? DEFAULT_COLORS[0] };
  if (value.type === Circle) return { kind: "circle", color: props.color ?? DEFAULT_COLORS[1] };
  if (value.type === Triangle) return { kind: "triangle", color: props.color ?? DEFAULT_COLORS[2] };

  return null;
}

function createDescriptors(total: number, colors: string[], component?: ReactNode | ReactNode[]) {
  const components = Array.isArray(component) ? component : component ? [component] : [];
  const descriptors = new Array<ShapeDescriptor>(total);

  for (let i = 0; i < total; i += 1) {
    const supplied = components.length > 0 ? componentToDescriptor(components[i % components.length]) : null;
    descriptors[i] =
      supplied ?? {
        kind: SHAPES[(Math.random() * SHAPES.length) | 0],
        color: colors[(Math.random() * colors.length) | 0] ?? DEFAULT_COLORS[0]
      };
  }

  return descriptors;
}

function useStableDescriptors(total: number, colors: string[], component?: ReactNode | ReactNode[]) {
  return useMemo(() => createDescriptors(total, colors, component), [total, colors, component]);
}

class ConfettiEngine {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private lastTime = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly count: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly size: Float32Array;
  private readonly rotation: Float32Array;
  private readonly spin: Float32Array;
  private readonly shape: Uint8Array;
  private readonly color: string[];

  constructor(
    private canvas: HTMLCanvasElement,
    private descriptors: ShapeDescriptor[],
    private options: Required<Pick<ConfettiProps, "gravity" | "wind" | "speed" | "recycle">>
  ) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("better-react-confetti requires a 2D canvas context.");

    this.ctx = ctx;
    this.count = descriptors.length;
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.vx = new Float32Array(this.count);
    this.vy = new Float32Array(this.count);
    this.size = new Float32Array(this.count);
    this.rotation = new Float32Array(this.count);
    this.spin = new Float32Array(this.count);
    this.shape = new Uint8Array(this.count);
    this.color = new Array<string>(this.count);
  }

  resize(width: number, height: number) {
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start() {
    for (let i = 0; i < this.count; i += 1) {
      this.reset(i, Math.random() * this.height - this.height);
    }
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private reset(i: number, y = -20) {
    const descriptor = this.descriptors[i];
    this.x[i] = Math.random() * this.width;
    this.y[i] = y;
    this.vx[i] = (Math.random() - 0.5) * 34 * this.options.speed;
    this.vy[i] = (65 + Math.random() * 70) * this.options.speed;
    this.size[i] = 6 + Math.random() * 7;
    this.rotation[i] = Math.random() * Math.PI * 2;
    this.spin[i] = (Math.random() - 0.5) * 7;
    this.shape[i] = descriptor.kind === "circle" ? 1 : descriptor.kind === "triangle" ? 2 : 0;
    this.color[i] = descriptor.color;
  }

  private tick = (time: number) => {
    const dt = Math.min(0.033, Math.max(0.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  private update(dt: number) {
    const gravity = this.options.gravity * 100;
    const wind = this.options.wind * 30;

    for (let i = 0; i < this.count; i += 1) {
      this.vy[i] += gravity * dt;
      this.vx[i] += wind * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rotation[i] += this.spin[i] * dt;

      if (this.y[i] > this.height + 24 || this.x[i] < -40 || this.x[i] > this.width + 40) {
        if (this.options.recycle) {
          this.reset(i);
        }
      }
    }
  }

  private draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.count; i += 1) {
      ctx.save();
      ctx.translate(this.x[i], this.y[i]);
      ctx.rotate(this.rotation[i]);
      ctx.fillStyle = this.color[i];
      this.drawShape(this.shape[i], this.size[i]);
      ctx.restore();
    }
  }

  private drawShape(shape: number, size: number) {
    const ctx = this.ctx;

    if (shape === 1) {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (shape === 2) {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.58);
      ctx.lineTo(size * 0.55, size * 0.5);
      ctx.lineTo(-size * 0.55, size * 0.5);
      ctx.closePath();
      ctx.fill();
      return;
    }

    ctx.fillRect(size * -0.55, size * -0.35, size * 1.1, size * 0.7);
  }
}

function Confetti({
  total = 90,
  Component,
  colors = DEFAULT_COLORS,
  gravity = 0.22,
  wind = 0,
  speed = 1,
  recycle = true,
  style: styleProp,
  className,
  ...props
}: ConfettiProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const descriptors = useStableDescriptors(total, colors, Component);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const engine = new ConfettiEngine(canvas, descriptors, { gravity, wind, speed, recycle });
    const resize = () => {
      const rect = root.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };

    resize();
    engine.start();

    const observer = new ResizeObserver(resize);
    observer.observe(root);

    return () => {
      observer.disconnect();
      engine.stop();
    };
  }, [descriptors, gravity, wind, speed, recycle]);

  return (
    <div
      {...props}
      ref={rootRef}
      className={className}
      style={{ ...style, ...styleProp }}
      data-confetti-engine="canvas"
    >
      <canvas ref={canvasRef} aria-hidden="true" style={{ display: "block" }} />
    </div>
  );
}

Confetti.displayName = "Confetti";

export { Confetti };
export default Confetti;
