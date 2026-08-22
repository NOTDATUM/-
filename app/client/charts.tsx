"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LAST_ROUND,
  stocks,
  type PriceSchedule,
  type Stock,
} from "../game-data";
import { money } from "./constants";

function useCanvasPainter(
  paint: (canvas: HTMLCanvasElement) => void,
  dependencies: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const run = () => paint(canvas);
    run();
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return ref;
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

type ChartViewport = { min: number; max: number; xMax: number };

function niceScaleStep(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  const fraction = value / magnitude;
  const niceFraction =
    fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return niceFraction * magnitude;
}

function getAllStocksViewport(
  round: number,
  selectedTicker: string | null,
  prices: PriceSchedule,
): ChartViewport {
  const visibleStocks = selectedTicker
    ? stocks.filter((stock) => stock.ticker === selectedTicker)
    : stocks;
  const values = visibleStocks.flatMap((stock) =>
    (prices[stock.ticker] ?? stock.prices)
      .slice(0, round + 1)
      .filter((price): price is number => price !== null),
  );
  if (!values.length) {
    return {
      min: 0,
      max: 100,
      xMax: Math.min(LAST_ROUND, Math.max(2, round + 1)),
    };
  }
  if (Math.max(...values) - Math.min(...values) < 1) {
    const center = values[0];
    const padding = Math.max(center * 0.12, 10);
    const step = niceScaleStep((padding * 2) / 5);
    return {
      min: Math.max(0, Math.floor((center - padding) / step) * step),
      max: Math.ceil((center + padding) / step) * step,
      xMax: Math.min(LAST_ROUND, Math.max(2, round + 1)),
    };
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.15, 5);
  const paddedMin = Math.max(0, rawMin - padding);
  const paddedMax = rawMax + padding;
  const step = niceScaleStep((paddedMax - paddedMin) / 6);
  return {
    min: Math.max(0, Math.floor(paddedMin / step) * step),
    max: Math.ceil(paddedMax / step) * step,
    xMax: Math.min(LAST_ROUND, Math.max(2, round + 1)),
  };
}

export function AllStocksChart({
  round,
  prices,
  compact = false,
  selectedTicker = null,
  tone = "dark",
}: {
  round: number;
  prices: PriceSchedule;
  compact?: boolean;
  selectedTicker?: string | null;
  tone?: "light" | "dark" | "projector";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ChartViewport | null>(null);
  const previousRoundRef = useRef<number | null>(null);
  const targetViewport = useMemo(
    () => getAllStocksViewport(round, selectedTicker, prices),
    [round, selectedTicker, prices],
  );
  const visibleStocks = useMemo(
    () =>
      selectedTicker
        ? stocks.filter((stock) => stock.ticker === selectedTicker)
        : stocks,
    [selectedTicker],
  );

  const draw = useCallback(
    (canvas: HTMLCanvasElement, viewport: ChartViewport, reveal: number) => {
      const prepared = prepareCanvas(canvas);
      if (!prepared) return;
      const { context, width, height } = prepared;
      const projector = tone === "projector";
      const pad = compact
        ? { top: 12, right: 10, bottom: 22, left: 10 }
        : projector
          ? { top: 37, right: 32, bottom: 58, left: 88 }
          : { top: 31, right: 26, bottom: 46, left: 72 };
      const plotWidth = width - pad.left - pad.right;
      const plotHeight = height - pad.top - pad.bottom;
      const x = (index: number) =>
        pad.left + (index / viewport.xMax) * plotWidth;
      const y = (indexValue: number) =>
        pad.top +
        ((viewport.max - indexValue) / (viewport.max - viewport.min)) *
          plotHeight;

      if (!compact) {
        context.font = projector ? "750 15px Arial" : "650 12px Arial";
        context.fillStyle =
          tone === "light"
            ? "#6b7684"
            : projector
              ? "rgba(255,255,255,.92)"
              : "rgba(211,222,240,.55)";
        context.textAlign = "left";
        context.fillText("주가 (BE)", pad.left, 13);
        for (let grid = 0; grid <= 5; grid += 1) {
          const value =
            viewport.max - (grid / 5) * (viewport.max - viewport.min);
          const py = y(value);
          context.strokeStyle =
            tone === "light"
              ? "rgba(25,31,40,.09)"
              : projector
                ? "rgba(255,255,255,.2)"
                : "rgba(255,255,255,.07)";
          context.lineWidth = projector ? 1.4 : 1;
          context.beginPath();
          context.moveTo(pad.left, py);
          context.lineTo(width - pad.right, py);
          context.stroke();
          context.fillStyle =
            tone === "light"
              ? "#8b95a1"
              : projector
                ? "rgba(255,255,255,.88)"
                : "rgba(211,222,240,.5)";
          context.textAlign = "right";
          context.fillText(
            money.format(Math.round(value)),
            pad.left - 11,
            py + 4,
          );
        }
        context.strokeStyle =
          tone === "light"
            ? "rgba(25,31,40,.16)"
            : projector
              ? "rgba(255,255,255,.42)"
              : "rgba(255,255,255,.12)";
        context.lineWidth = projector ? 1.8 : 1;
        context.beginPath();
        context.moveTo(pad.left, pad.top);
        context.lineTo(pad.left, height - pad.bottom);
        context.lineTo(width - pad.right, height - pad.bottom);
        context.stroke();
        for (
          let index = 0;
          index <= Math.floor(viewport.xMax + 0.001);
          index += 1
        ) {
          context.fillStyle =
            index <= round
              ? tone === "light"
                ? "#6b7684"
                : projector
                  ? "rgba(255,255,255,.94)"
                  : "rgba(225,233,246,.7)"
              : tone === "light"
                ? "#d1d6db"
                : projector
                  ? "rgba(255,255,255,.28)"
                  : "rgba(225,233,246,.2)";
          context.textAlign = "center";
          context.fillText(
            index === 0 ? "기준가" : `${index}라운드`,
            x(index),
            height - 13,
          );
        }
      }

      visibleStocks.forEach((stock) => {
        const points = (prices[stock.ticker] ?? stock.prices)
          .map((price, index) => ({ index, value: price }))
          .filter(
            (point) => point.index <= round && point.value !== null,
          ) as Array<{ index: number; value: number }>;
        if (!points.length) return;
        const animatedPoints = points.map((point, index) => {
          if (point.index !== round || index === 0 || reveal >= 1) return point;
          const previous = points[index - 1];
          return {
            index: previous.index + (point.index - previous.index) * reveal,
            value: previous.value + (point.value - previous.value) * reveal,
          };
        });
        const entering =
          points.length === 1 && points[0].index === round && reveal < 1;
        context.beginPath();
        animatedPoints.forEach((point, index) => {
          const px = x(point.index);
          const py = y(point.value);
          if (index === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        });
        context.strokeStyle = stock.color;
        context.lineWidth = compact ? 1.4 : projector ? 3.6 : 2.2;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.globalAlpha =
          (compact ? 0.8 : 0.92) * (entering ? Math.max(0.15, reveal) : 1);
        context.stroke();
        context.globalAlpha = 1;
        const last = animatedPoints.at(-1)!;
        const pulse = Math.sin(reveal * Math.PI);
        context.save();
        context.shadowColor = stock.color;
        context.shadowBlur = pulse * (compact ? 7 : 14);
        context.beginPath();
        context.arc(
          x(last.index),
          y(last.value),
          (compact ? 2 : 3.2) + pulse * (compact ? 1 : 2),
          0,
          Math.PI * 2,
        );
        context.fillStyle = stock.color;
        context.globalAlpha = entering ? Math.max(0.15, reveal) : 1;
        context.fill();
        context.restore();
        if (!compact && selectedTicker === stock.ticker) {
          context.fillStyle = stock.color;
          context.font = "700 12px Arial";
          context.textAlign = "right";
          context.fillText(
            `${money.format(Math.round(last.value))} BE`,
            width - pad.right,
            Math.max(pad.top + 12, y(last.value) - 10),
          );
        }
      });
    },
    [round, compact, prices, selectedTicker, tone, visibleStocks],
  );

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const from = viewportRef.current ?? targetViewport;
    const previousRound = previousRoundRef.current;
    const roundChanged = previousRound !== null && previousRound !== round;
    const revealPoint =
      roundChanged && previousRound !== null && round > previousRound;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const viewportChanged =
      Math.abs(from.min - targetViewport.min) > 0.01 ||
      Math.abs(from.max - targetViewport.max) > 0.01 ||
      Math.abs(from.xMax - targetViewport.xMax) > 0.01;
    const duration =
      (roundChanged || viewportChanged) && !reducedMotion ? 950 : 0;
    const startedAt = performance.now();
    let animationFrame = 0;
    let resizeFrame = 0;

    previousRoundRef.current = round;
    const animate = (now: number) => {
      const progress = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = 1 - (1 - progress) ** 3;
      const viewport = {
        min: from.min + (targetViewport.min - from.min) * eased,
        max: from.max + (targetViewport.max - from.max) * eased,
        xMax: from.xMax + (targetViewport.xMax - from.xMax) * eased,
      };
      viewportRef.current = viewport;
      draw(canvas, viewport, revealPoint ? eased : 1);
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };
    animate(startedAt);

    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() =>
        draw(canvas, viewportRef.current ?? targetViewport, 1),
      );
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", resize);
    };
  }, [draw, round, targetViewport]);

  return (
    <div className="all-chart-shell">
      <canvas
        ref={ref}
        className={compact ? "all-chart compact" : "all-chart"}
        aria-label={`${selectedTicker ?? "전체 종목"} 실제 주가 차트, 세로축 ${targetViewport.min} BE에서 ${targetViewport.max} BE, 가로축 기준가부터 ${round}라운드`}
      />
      {!compact && (
        <span
          key={`${round}-${selectedTicker ?? "all"}`}
          className="chart-scale-pill"
        >
          {selectedTicker ?? "ALL"} · AUTO SCALE · {targetViewport.min}–
          {targetViewport.max} BE
        </span>
      )}
    </div>
  );
}

export function ScenarioPriceChart({
  stock,
  values,
  firstEditableRound,
  dirty,
  onChange,
}: {
  stock: Stock;
  values: Array<number | null>;
  firstEditableRound: number;
  dirty: Set<string>;
  onChange: (ticker: string, round: number, value: number) => void;
}) {
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [hoveredRound, setHoveredRound] = useState<number | null>(null);
  const [dragViewport, setDragViewport] = useState<{
    min: number;
    max: number;
  } | null>(null);
  const activeRoundRef = useRef<number | null>(null);
  const dragViewportRef = useRef<{ min: number; max: number } | null>(null);
  const calculatedViewport = useMemo(() => {
    const numeric = values.filter((value): value is number => value !== null);
    if (!numeric.length) return { min: 1, max: 101 };
    const rawMin = Math.min(...numeric);
    const rawMax = Math.max(...numeric);
    const spread = Math.max(rawMax - rawMin, rawMax * 0.22, 20);
    const step = niceScaleStep(spread / 5);
    const min = Math.max(1, Math.floor((rawMin - spread * 0.28) / step) * step);
    const max = Math.max(
      min + 10,
      Math.ceil((rawMax + spread * 0.28) / step) * step,
    );
    return { min, max };
  }, [values]);
  const viewport =
    activeRound !== null && dragViewport ? dragViewport : calculatedViewport;

  const paint = useCallback(
    (canvas: HTMLCanvasElement) => {
      const prepared = prepareCanvas(canvas);
      if (!prepared) return;
      const { context, width, height } = prepared;
      const pad = { top: 38, right: 28, bottom: 50, left: 76 };
      const plotWidth = Math.max(1, width - pad.left - pad.right);
      const plotHeight = Math.max(1, height - pad.top - pad.bottom);
      const x = (round: number) => pad.left + (round / LAST_ROUND) * plotWidth;
      const y = (value: number) =>
        pad.top +
        ((viewport.max - value) / (viewport.max - viewport.min)) * plotHeight;

      if (firstEditableRound > 0) {
        const lockEnd = Math.min(
          width - pad.right,
          x(Math.min(LAST_ROUND, firstEditableRound - 0.5)),
        );
        context.fillStyle = "rgba(255,255,255,.025)";
        context.fillRect(
          pad.left,
          pad.top,
          Math.max(0, lockEnd - pad.left),
          plotHeight,
        );
      }
      for (let grid = 0; grid <= 5; grid += 1) {
        const value = Math.round(
          viewport.max - (grid / 5) * (viewport.max - viewport.min),
        );
        const py = y(value);
        context.strokeStyle = "rgba(187,207,232,.105)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(pad.left, py);
        context.lineTo(width - pad.right, py);
        context.stroke();
        context.fillStyle = "#8090a6";
        context.font = "650 11px Arial";
        context.textAlign = "right";
        context.fillText(money.format(value), pad.left - 12, py + 4);
      }
      for (let round = 0; round <= LAST_ROUND; round += 1) {
        const px = x(round);
        context.strokeStyle = "rgba(187,207,232,.055)";
        context.beginPath();
        context.moveTo(px, pad.top);
        context.lineTo(px, height - pad.bottom);
        context.stroke();
        context.fillStyle =
          round < firstEditableRound
            ? "#58667a"
            : round === firstEditableRound
              ? "#c9fa70"
              : "#91a0b5";
        context.font =
          round === firstEditableRound ? "750 11px Arial" : "650 10px Arial";
        context.textAlign = "center";
        context.fillText(round === 0 ? "기준" : `R${round}`, px, height - 18);
      }
      if (firstEditableRound <= LAST_ROUND) {
        context.save();
        context.setLineDash([5, 5]);
        context.strokeStyle = "rgba(183,243,76,.5)";
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(x(firstEditableRound), pad.top);
        context.lineTo(x(firstEditableRound), height - pad.bottom);
        context.stroke();
        context.restore();
      }

      let segmentOpen = false;
      context.beginPath();
      values.slice(0, LAST_ROUND + 1).forEach((value, round) => {
        if (value === null) {
          segmentOpen = false;
          return;
        }
        if (!segmentOpen) {
          context.moveTo(x(round), y(value));
          segmentOpen = true;
        } else context.lineTo(x(round), y(value));
      });
      context.strokeStyle = stock.color;
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.shadowColor = `${stock.color}55`;
      context.shadowBlur = 8;
      context.stroke();
      context.shadowBlur = 0;

      values.slice(0, LAST_ROUND + 1).forEach((value, round) => {
        const editable = round >= firstEditableRound;
        const focused = round === activeRound || round === hoveredRound;
        const changed = dirty.has(`${stock.ticker}:${round}`);
        const px = x(round);
        const py = y(value ?? viewport.min);
        context.beginPath();
        context.arc(px, py, focused ? 9 : editable ? 6.5 : 4.5, 0, Math.PI * 2);
        context.fillStyle =
          value === null ? "#0b1422" : editable ? stock.color : "#526177";
        context.fill();
        context.lineWidth = changed ? 3 : editable ? 2 : 1.5;
        context.strokeStyle = changed
          ? "#d9ff93"
          : editable
            ? "#f4f8ff"
            : "#7a889b";
        context.stroke();
        if (focused && editable) {
          const label =
            value === null ? "값 없음" : `${money.format(value)} BE`;
          context.font = "750 11px Arial";
          const bubbleWidth = context.measureText(label).width + 18;
          const bubbleX = Math.min(
            width - pad.right - bubbleWidth,
            Math.max(pad.left, px - bubbleWidth / 2),
          );
          const bubbleY = Math.max(5, py - 35);
          context.fillStyle = "rgba(4,10,18,.96)";
          context.strokeStyle = stock.color;
          context.lineWidth = 1;
          context.beginPath();
          context.roundRect(bubbleX, bubbleY, bubbleWidth, 25, 6);
          context.fill();
          context.stroke();
          context.fillStyle = "#f7fbff";
          context.textAlign = "center";
          context.fillText(label, bubbleX + bubbleWidth / 2, bubbleY + 16.5);
        }
      });
      context.fillStyle = "#728198";
      context.font = "700 10px Arial";
      context.textAlign = "left";
      context.fillText("주가 (BE)", pad.left, 18);
    },
    [
      activeRound,
      dirty,
      firstEditableRound,
      hoveredRound,
      stock,
      values,
      viewport,
    ],
  );
  const canvasRef = useCanvasPainter(paint, [paint]);

  const geometry = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const pad = { top: 38, right: 28, bottom: 50, left: 76 };
    return {
      rect,
      pad,
      plotWidth: Math.max(1, rect.width - pad.left - pad.right),
      plotHeight: Math.max(1, rect.height - pad.top - pad.bottom),
    };
  };
  const nearestEditableRound = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const { rect, pad, plotWidth, plotHeight } = geometry(event.currentTarget);
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    let nearest: { round: number; distance: number } | null = null;
    for (
      let round = Math.max(0, firstEditableRound);
      round <= LAST_ROUND;
      round += 1
    ) {
      const px = pad.left + (round / LAST_ROUND) * plotWidth;
      const value = values[round];
      const py =
        pad.top +
        ((viewport.max - (value ?? viewport.min)) /
          (viewport.max - viewport.min)) *
          plotHeight;
      const distance = Math.hypot(pointerX - px, pointerY - py);
      if (!nearest || distance < nearest.distance)
        nearest = { round, distance };
    }
    return nearest && nearest.distance <= 24 ? nearest.round : null;
  };
  const changeFromPointer = (
    event: React.PointerEvent<HTMLCanvasElement>,
    round: number,
  ) => {
    const { rect, pad, plotHeight } = geometry(event.currentTarget);
    const activeViewport = dragViewportRef.current ?? viewport;
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top - pad.top) / plotHeight),
    );
    const value = Math.max(
      1,
      Math.round(
        activeViewport.max - ratio * (activeViewport.max - activeViewport.min),
      ),
    );
    onChange(stock.ticker, round, value);
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const round = nearestEditableRound(event);
    if (round === null) return;
    event.preventDefault();
    dragViewportRef.current = viewport;
    setDragViewport(viewport);
    activeRoundRef.current = round;
    setActiveRound(round);
    setHoveredRound(round);
    event.currentTarget.setPointerCapture(event.pointerId);
    changeFromPointer(event, round);
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRoundRef.current !== null) {
      event.preventDefault();
      changeFromPointer(event, activeRoundRef.current);
      return;
    }
    setHoveredRound(nearestEditableRound(event));
  };
  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRoundRef.current === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    activeRoundRef.current = null;
    dragViewportRef.current = null;
    setDragViewport(null);
    setActiveRound(null);
  };

  return (
    <div className="scenario-canvas-shell">
      <canvas
        ref={canvasRef}
        className={`scenario-canvas ${activeRound !== null ? "dragging" : ""}`}
        aria-label={`${stock.name} 주가 시나리오 차트. 공개되지 않은 점을 위아래로 드래그해 1 BE 단위로 수정`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (activeRoundRef.current === null) setHoveredRound(null);
        }}
      />
      <div className="scenario-chart-guide">
        <span>
          <i style={{ background: stock.color }} />
          선을 따라 가격 흐름 확인
        </span>
        <span>
          <b />
          테두리가 밝은 점은 수정 가능
        </span>
        <strong>점을 위·아래로 드래그 · 1 BE 단위</strong>
      </div>
    </div>
  );
}
