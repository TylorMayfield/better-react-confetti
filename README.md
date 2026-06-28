# better-react-confetti

A lightweight canvas-based React confetti implementation inspired by `@tholman/confetti`.

The default renderer uses one canvas and a single animation loop instead of creating one animated DOM subtree per particle. That keeps the DOM tiny, reduces React mount work, and makes large particle counts more predictable.

## Install

```bash
pnpm add better-react-confetti
```

## Usage

```tsx
import Confetti, { Circle, Rectangle, Triangle } from "better-react-confetti";

export function Celebration() {
  return (
    <Confetti
      total={120}
      Component={[
        <Rectangle color="#ef476f" key="rect" />,
        <Circle color="#06d6a0" key="circle" />,
        <Triangle color="#118ab2" key="triangle" />
      ]}
    />
  );
}
```

The component is absolutely positioned and fills its nearest positioned parent, matching the common `@tholman/confetti` usage pattern.

## How it is faster

`@tholman/confetti` renders each particle as React-created DOM:

- one outer animated element per particle
- one inner flipping element per particle
- one custom shape element per particle
- CSS custom properties and keyframe animations attached across that DOM tree

That is ergonomic and flexible, but large particle counts create a lot of nodes for the browser to style, lay out, animate, and keep in memory.

`better-react-confetti` moves the hot path out of React and into a small canvas engine:

- React renders one wrapper and one `<canvas>`, regardless of particle count.
- Particle state is stored in typed arrays instead of one object or DOM subtree per particle.
- A single `requestAnimationFrame` loop updates positions, velocity, rotation, and recycling.
- The canvas is resized through `ResizeObserver`, with device pixel ratio capped to avoid runaway backing-store sizes.
- Built-in `Rectangle`, `Circle`, and `Triangle` components compile down to lightweight shape descriptors for the canvas renderer.

The main tradeoff is that canvas rendering is less DOM-native. The current optimized path is designed for the built-in shape components, not arbitrary custom React shape trees. If arbitrary custom DOM/SVG particle components are required, the original library's architecture is inherently more flexible.

## API

| Prop | Default | Description |
| --- | --- | --- |
| `total` | `90` | Number of particles. |
| `Component` | built-in mix | A built-in shape or array of built-in shapes. `Rectangle`, `Circle`, and `Triangle` are mapped to canvas descriptors. |
| `colors` | five-color palette | Palette used when `Component` is omitted. |
| `gravity` | `0.22` | Downward acceleration multiplier. |
| `wind` | `0` | Horizontal acceleration multiplier. |
| `speed` | `1` | Initial velocity multiplier. |
| `recycle` | `true` | Respawn particles after they leave the stage. |

## React compatibility

This package supports stable React releases from React 18.3 through the current React 19 line:

- React `18.3.x`
- React `19.0.x`
- React `19.1.x`
- React `19.2.x`

The peer dependency is `react >=18.3.0 <20` and `react-dom >=18.3.0 <20`. Before publishing, run the compatibility matrix:

```bash
pnpm compat:react
```

The matrix installs the built tarball into temporary consumer projects and checks TypeScript declarations plus SSR import/render behavior against React `18.3.1`, `19.0.7`, `19.1.8`, and `19.2.7`.

## Profiling

```bash
pnpm install
pnpm profile:run
```

The profiler runs `@tholman/confetti` and `better-react-confetti` in isolated Playwright sessions with the same particle count and duration, then writes:

- `results/profile-results.md`
- `results/profile-results.json`
- `results/original.png`
- `results/better.png`

The comparison is intended to be honest but not magic. The profiler uses:

- the same viewport: `1440x900`
- the same default workload: `700` particles for `12000ms`
- separate browser pages for each implementation, so one run does not affect the other
- visible built-in shapes from each package, with the same colors
- browser performance metrics for heap usage
- sampled `requestAnimationFrame` intervals for frame pacing
- React `Profiler` mount/update duration for React render work

The numbers are best read as directional performance evidence for this workload. They will vary by machine, browser version, display refresh rate, thermals, and background load. They are not a guarantee of exact FPS in every application.

### Current local result

The latest local run in this repository used `700` particles for `12000ms`.

| Metric | @tholman/confetti | better-react-confetti | Improvement |
| --- | ---: | ---: | ---: |
| DOM nodes | `2123` | `24` | `98.9%` fewer |
| Confetti DOM nodes | `1401` | `0` | `100.0%` fewer |
| JS heap used | `5.44 MB` | `2.27 MB` | `58.3%` lower |
| Avg frame interval | `16.9ms` | `8.33ms` | `50.7%` lower |
| P95 frame interval | `25.1ms` | `9.3ms` | `62.9%` lower |
| Dropped frame samples over `25ms` | `43` | `0` | `100.0%` fewer |
| React render total | `23.5ms` | `2ms` | `91.5%` lower |

Tune the workload with environment variables:

```bash
CONFETTI_TOTAL=1000 CONFETTI_DURATION=15000 pnpm profile:run
```
