const arena = document.querySelector("#arena");
const touchLayer = document.querySelector("#touchLayer");
const winnerWash = document.querySelector("#winnerWash");
const winnerMask = document.querySelector("#winnerMask");
const gifReveal = document.querySelector("#gifReveal");

const palette = [
  { fill: "#93ca35", ring: "#78a71f", winner: "#b2dd5e" },
  { fill: "#fde35d", ring: "#ffd800", winner: "#ffef89" },
  { fill: "#1c97b8", ring: "#2d84a1", winner: "#79cbe9" },
  { fill: "#dd33b4", ring: "#dd00a5", winner: "#eb6bd0" },
  { fill: "#c93ae5", ring: "#b300d1", winner: "#d96af0" }
];

const touches = new Map();
const ringCircumference = 100;
const fullRingFillMs = 220;
const primaryStartSpan = 18;
const echoMinSpan = 12;
const echoLoopDuration = 900;
const pulseAmplitude = 0.045;
const pulseSpeed = 150;
const pickDelayMin = 1325;
const pickDelayJitter = 250;
const winnerFloodPauseMs = 110;
const winnerFloodDurationMs = 280;
const winnerMaskScaleFactor = 2;
const gifWinWindowMs = 10000;
const gifRevealDurationMs = 2200;
const gifRevealScaleFactor = 10;

let selectionTimer = null;
let animationFrame = 0;
let visualStartedAt = 0;
let roundActive = false;
let lockedWinnerId = null;
let roundToken = 0;
let hasInteracted = false;
let winnerFloodTimer = null;
let winnerReleaseTimer = null;
let winnerMaskCoverScale = 1;
let roundFirstPointerId = null;
let gifRevealDelayTimer = null;
let gifRevealResetTimer = null;
let gifRevealActive = false;
let gifRevealRadius = 0;
let lastWinAt = 0;
let shouldRevealGifThisRound = false;

function getActiveTouches() {
  return [...touches.values()].filter((touch) => !touch.removing);
}

function nextColor() {
  const used = new Set(getActiveTouches().map((touch) => touch.fill));
  const available = palette.filter((entry) => !used.has(entry.fill));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return palette[Math.floor(Math.random() * palette.length)];
}

function createTouchMarkup() {
  const element = document.createElement("div");
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  const echoSvg = document.createElementNS(svgNs, "svg");
  const primary = document.createElementNS(svgNs, "circle");
  const echo = document.createElementNS(svgNs, "circle");
  const core = document.createElement("div");
  const winnerShell = document.createElement("div");
  const winnerInner = document.createElement("div");

  element.className = "touch visible";
  svg.setAttribute("viewBox", "0 0 160 160");
  svg.setAttribute("aria-hidden", "true");
  echoSvg.setAttribute("viewBox", "0 0 160 160");
  echoSvg.setAttribute("aria-hidden", "true");
  echoSvg.classList.add("touchEchoSvg");

  for (const circle of [primary, echo]) {
    circle.setAttribute("cx", "80");
    circle.setAttribute("cy", "80");
    circle.setAttribute("r", "60");
    circle.setAttribute("pathLength", "100");
    circle.setAttribute("stroke-dasharray", "0 100");
    circle.setAttribute("stroke-dashoffset", "0");
  }

  primary.classList.add("touchCircle");
  echo.classList.add("touchCircle", "echo");

  core.className = "touchCore";
  winnerShell.className = "touchWinnerShell";
  winnerInner.className = "touchWinnerInner";

  svg.append(primary);
  echoSvg.append(echo);
  element.append(svg, echoSvg, core, winnerShell, winnerInner);

  return {
    element,
    primary,
    echoSvg,
    echo,
    core,
    winnerInner
  };
}

function createTouch(pointerId, x, y) {
  const colors = nextColor();
  const { element, primary, echoSvg, echo, core, winnerInner } = createTouchMarkup();

  element.style.setProperty("--touch-color", colors.fill);
  element.style.setProperty("--winner-ring", colors.winner);
  element.style.setProperty("--winner-fill", colors.fill);
  primary.setAttribute("stroke", colors.ring);
  echo.setAttribute("stroke", colors.winner);
  core.style.background = colors.fill;
  winnerInner.style.background = colors.fill;

  const touch = {
    pointerId,
    x,
    y,
    fill: colors.fill,
    element,
    primary,
    echoSvg,
    echo,
    scale: 0.12,
    pulseScale: 1,
    currentRingState: null,
    removing: false,
    removeTimer: null
  };

  touchLayer.appendChild(element);
  touches.set(pointerId, touch);
  positionTouch(touch);

  requestAnimationFrame(() => {
    if (!touches.has(pointerId) || touch.removing) {
      return;
    }

    element.style.opacity = "1";
    touch.scale = 1;
    positionTouch(touch);
    renderRingState(touch, getCurrentRingState());
  });
}

function positionTouch(touch) {
  touch.element.style.left = `${touch.x}px`;
  touch.element.style.top = `${touch.y}px`;
  touch.element.style.transform = `translate(-50%, -50%) scale(${touch.scale * touch.pulseScale})`;
}

function renderRingState(touch, ringState) {
  if (!ringState) {
    touch.primary.setAttribute("stroke-dasharray", `0 ${ringCircumference}`);
    touch.primary.setAttribute("stroke-dashoffset", "0");
    touch.primary.style.opacity = "1";
    touch.echo.setAttribute("stroke-dasharray", `0 ${ringCircumference}`);
    touch.echo.setAttribute("stroke-dashoffset", "0");
    touch.echoSvg.style.transform = "rotate(-90deg)";
    touch.echo.style.opacity = "0";
    touch.currentRingState = null;
    return;
  }

  const primarySpan = ringState.primarySpan >= ringCircumference
    ? ringCircumference
    : ringState.primarySpan;
  const echoSpan = ringState.echoSpan >= ringCircumference
    ? ringCircumference
    : ringState.echoSpan;
  const primaryDashArray = primarySpan >= ringCircumference
    ? `${ringCircumference} 0.01`
    : `${primarySpan} ${ringCircumference}`;
  const echoDashArray = echoSpan >= ringCircumference
    ? `${ringCircumference} 0.01`
    : `${echoSpan} ${ringCircumference}`;

  touch.primary.setAttribute(
    "stroke-dasharray",
    primaryDashArray
  );
  touch.primary.setAttribute("stroke-dashoffset", `${ringState.primaryOffset}`);
  touch.echo.setAttribute("stroke-dasharray", echoDashArray);
  touch.echo.setAttribute("stroke-dashoffset", "0");
  touch.echoSvg.style.transform = `rotate(${ringState.echoRotation - 90}deg)`;
  touch.echo.style.opacity = echoSpan > 0 ? "1" : "0";
  touch.currentRingState = ringState;
}

function clearWinnerFloodTimer() {
  if (winnerFloodTimer) {
    clearTimeout(winnerFloodTimer);
    winnerFloodTimer = null;
  }

  if (winnerReleaseTimer) {
    clearTimeout(winnerReleaseTimer);
    winnerReleaseTimer = null;
  }

  if (gifRevealDelayTimer) {
    clearTimeout(gifRevealDelayTimer);
    gifRevealDelayTimer = null;
  }

  if (gifRevealResetTimer) {
    clearTimeout(gifRevealResetTimer);
    gifRevealResetTimer = null;
  }
}

function syncWinnerMaskPosition(touch) {
  if (!touch || !winnerMask.classList.contains("visible")) {
    return;
  }

  winnerMask.style.left = `${touch.x}px`;
  winnerMask.style.top = `${touch.y}px`;
}

function setGifRevealClip(radius, x, y) {
  gifRevealRadius = radius;
  gifReveal.style.clipPath = `circle(${radius}px at ${x}px ${y}px)`;
}

function reverseAndHideRing(touch) {
  const ringState = touch.currentRingState;
  if (!ringState) {
    renderRingState(touch, null);
    return;
  }

  touch.primary.style.opacity = "0";
  touch.echo.style.opacity = "0";
  touch.primary.setAttribute(
    "stroke-dashoffset",
    `${ringState.primaryOffset + ringState.primarySpan}`
  );
  touch.primary.setAttribute("stroke-dasharray", `0 ${ringCircumference}`);
  touch.echoSvg.style.transform = `rotate(${ringState.echoRotation - 90}deg)`;
  touch.echo.setAttribute("stroke-dasharray", `0 ${ringCircumference}`);
  touch.currentRingState = null;
}

function getCurrentRingState() {
  if (!visualStartedAt) {
    return null;
  }

  const elapsed = performance.now() - visualStartedAt;
  const activeCount = getActiveTouches().length;
  const fillProgress = Math.max(0, Math.min(1, elapsed / fullRingFillMs));
  const primarySpan = Math.min(
    ringCircumference,
    primaryStartSpan + fillProgress * (ringCircumference - primaryStartSpan)
  );

  if (activeCount <= 1) {
    return {
      primarySpan,
      primaryOffset: 0,
      echoSpan: 0,
      echoRotation: 0
    };
  }

  const echoReady = primarySpan >= ringCircumference;
  const echoElapsed = Math.max(0, elapsed - fullRingFillMs);
  const echoProgress = Math.max(0, Math.min(1, echoElapsed / 2200));

  if (echoReady && echoProgress >= 1) {
    return {
      primarySpan: ringCircumference,
      primaryOffset: 0,
      echoSpan: ringCircumference,
      echoRotation: 306
    };
  }

  const echoSpan = echoReady
    ? echoMinSpan + echoProgress * (ringCircumference - echoMinSpan)
    : 0;
  const echoRotation = echoReady
    ? echoProgress * 306
    : 0;

  return {
    primarySpan: ringCircumference,
    primaryOffset: 0,
    echoSpan,
    echoRotation
  };
}

function updateTouchPulse(touch, elapsed) {
  touch.pulseScale = 1 + Math.sin(elapsed / pulseSpeed) * pulseAmplitude;
  positionTouch(touch);
}

function tickTouches(now) {
  const activeTouches = getActiveTouches();
  if (activeTouches.length === 0) {
    animationFrame = 0;
    return;
  }

  const elapsed = visualStartedAt ? now - visualStartedAt : 0;
  const ringState = getCurrentRingState();

  for (const touch of activeTouches) {
    renderRingState(touch, ringState);
    updateTouchPulse(touch, elapsed);
  }

  animationFrame = requestAnimationFrame(tickTouches);
}

function ensureTouchAnimation() {
  if (!visualStartedAt) {
    visualStartedAt = performance.now();
  }

  if (!animationFrame) {
    animationFrame = requestAnimationFrame(tickTouches);
  }
}

function scheduleSelectionReset() {
  if (selectionTimer) {
    clearTimeout(selectionTimer);
  }

  const duration = pickDelayMin + Math.random() * pickDelayJitter;
  selectionTimer = window.setTimeout(() => {
    chooseWinner();
  }, duration);
}

function clearRound() {
  if (selectionTimer) {
    clearTimeout(selectionTimer);
    selectionTimer = null;
  }

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  visualStartedAt = 0;
  roundFirstPointerId = null;
  gifRevealActive = false;
  gifRevealRadius = 0;
  shouldRevealGifThisRound = false;
  clearWinnerFloodTimer();
  gifReveal.classList.remove("visible");
  gifReveal.style.clipPath = "circle(0px at 50% 50%)";

  for (const touch of touches.values()) {
    touch.pulseScale = 1;
    renderRingState(touch, null);
    positionTouch(touch);
  }
}

function finishResetState() {
  winnerWash.classList.remove("visible");
  winnerWash.style.background = "transparent";
  winnerMask.classList.remove("visible");
  winnerMask.style.opacity = "0";
  gifReveal.classList.remove("visible");
  gifReveal.style.clipPath = "circle(0px at 50% 50%)";
  roundActive = false;
  lockedWinnerId = null;
  document.body.classList.remove("touching");
  clearRound();

  for (const [pointerId, touch] of [...touches.entries()]) {
    if (touch.removeTimer) {
      clearTimeout(touch.removeTimer);
    }

    touch.removing = true;
    touch.scale = 0;
    touch.pulseScale = 1;
    touch.element.style.opacity = "0";
    positionTouch(touch);

    window.setTimeout(() => {
      touch.element.remove();
      touches.delete(pointerId);
    }, 220);
  }
}

function updateRoundState() {
  const activeCount = getActiveTouches().length;

  if (activeCount === 0) {
    clearRound();
    return;
  }

  ensureTouchAnimation();

  if (roundActive) {
    return;
  }

  if (activeCount >= 2) {
    scheduleSelectionReset();
    return;
  }

  if (selectionTimer) {
    clearTimeout(selectionTimer);
    selectionTimer = null;
  }
}

function releaseTouch(pointerId) {
  const touch = touches.get(pointerId);
  if (!touch || touch.removing) {
    return;
  }

  touch.removing = true;
  touch.pulseScale = 1;
  touch.scale = 0;
  touch.element.style.opacity = "0";
  touch.element.classList.remove("winner", "loser");
  reverseAndHideRing(touch);
  positionTouch(touch);

  touch.removeTimer = window.setTimeout(() => {
    touch.element.remove();
    touches.delete(pointerId);
  }, 220);
}

function finishWinnerAnimation(winner) {
  const bounds = touchLayer.getBoundingClientRect();
  const floodRadius = Math.max(
    Math.hypot(winner.x, winner.y),
    Math.hypot(bounds.width - winner.x, winner.y),
    Math.hypot(winner.x, bounds.height - winner.y),
    Math.hypot(bounds.width - winner.x, bounds.height - winner.y)
  );
  const finalDiameter = winner.element.getBoundingClientRect().width * winnerMaskScaleFactor;
  const coverDiameter = floodRadius * 2 + finalDiameter;
  const coverScale = coverDiameter / finalDiameter;

  winnerMaskCoverScale = coverScale;

  winnerWash.style.background = winner.fill;
  winnerWash.classList.add("visible");

  winnerMask.style.left = `${winner.x}px`;
  winnerMask.style.top = `${winner.y}px`;
  winnerMask.style.width = `${finalDiameter}px`;
  winnerMask.style.height = `${finalDiameter}px`;
  winnerMask.style.transform = `translate(-50%, -50%) scale(${coverScale})`;
  winnerMask.classList.add("visible");
  winnerMask.style.opacity = "1";
  void winnerMask.offsetWidth;

  const currentRound = roundToken;
  winnerFloodTimer = window.setTimeout(() => {
    if (currentRound !== roundToken) {
      return;
    }

    syncWinnerMaskPosition(winner);
    winnerMask.style.transform = "translate(-50%, -50%) scale(1)";
  }, winnerFloodPauseMs);

  window.setTimeout(() => {
    if (currentRound !== roundToken) {
      return;
    }

    for (const [pointerId, touch] of [...touches.entries()]) {
      if (pointerId !== lockedWinnerId) {
        touch.element.remove();
        touches.delete(pointerId);
      }
    }
  }, winnerFloodPauseMs + 120);

  if (shouldRevealGifThisRound) {
    gifRevealDelayTimer = window.setTimeout(() => {
      if (currentRound !== roundToken || lockedWinnerId !== winner.pointerId) {
        return;
      }

      const bounds = touchLayer.getBoundingClientRect();
      const maxDimension = Math.max(bounds.width, bounds.height);
      const revealRadius = maxDimension * gifRevealScaleFactor;

      gifRevealActive = true;
      setGifRevealClip(0, winner.x, winner.y);
      gifReveal.classList.add("visible");
      void gifReveal.offsetWidth;
      setGifRevealClip(revealRadius, winner.x, winner.y);

      gifRevealResetTimer = window.setTimeout(() => {
        if (currentRound !== roundToken) {
          return;
        }

        finishResetState();
      }, gifRevealDurationMs);
    }, winnerFloodPauseMs + 120);
  }
}

function chooseWinner() {
  if (selectionTimer) {
    clearTimeout(selectionTimer);
    selectionTimer = null;
  }

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  visualStartedAt = 0;

  const activeTouches = getActiveTouches();
  if (activeTouches.length < 2) {
    clearRound();
    return;
  }

  const eligibleTouches = activeTouches.filter(
    (touch) => touch.pointerId !== roundFirstPointerId
  );
  const winnerPool = eligibleTouches.length > 0 ? eligibleTouches : activeTouches;
  const now = performance.now();
  shouldRevealGifThisRound = lastWinAt > 0 && now - lastWinAt <= gifWinWindowMs;
  lastWinAt = now;
  const winner = winnerPool[Math.floor(Math.random() * winnerPool.length)];
  lockedWinnerId = winner.pointerId;
  roundActive = true;
  roundToken += 1;

  for (const touch of activeTouches) {
    touch.pulseScale = 1;
    if (touch.pointerId === winner.pointerId) {
      touch.element.classList.add("winner");
      touch.scale = 1;
      renderRingState(touch, {
        primarySpan: ringCircumference,
        primaryOffset: 0,
        echoSpan: 0,
        echoRotation: 0
      });
    } else {
      touch.element.classList.add("loser");
      touch.scale = 0.3;
    }
    positionTouch(touch);
  }

  finishWinnerAnimation(winner);
}

function endRound() {
  if (gifRevealActive) {
    return;
  }

  clearWinnerFloodTimer();

  const winner = lockedWinnerId !== null ? touches.get(lockedWinnerId) : null;
  const currentRound = roundToken + 1;
  roundToken = currentRound;

  if (winner && winnerMask.classList.contains("visible")) {
    syncWinnerMaskPosition(winner);
    winnerMask.style.transform = `translate(-50%, -50%) scale(${winnerMaskCoverScale})`;
  }

  winnerReleaseTimer = window.setTimeout(() => {
    if (roundToken !== currentRound) {
      return;
    }

    finishResetState();
  }, winner ? winnerFloodDurationMs : 0);
}

function destroyTouch(pointerId) {
  const touch = touches.get(pointerId);
  if (!touch) {
    return;
  }

  if (lockedWinnerId === pointerId) {
    endRound();
    return;
  }

  releaseTouch(pointerId);

  if (!roundActive) {
    updateRoundState();
  }
}

function normalizeEventPosition(event) {
  const bounds = touchLayer.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  };
}

function preventNativeGesture(event) {
  event.preventDefault();
}

function handlePointerDown(event) {
  if (!event.isPrimary && event.pointerType === "mouse") {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  if (lockedWinnerId !== null) {
    return;
  }

  event.preventDefault();
  arena.setPointerCapture(event.pointerId);
  document.body.classList.add("touching");

  if (!hasInteracted) {
    hasInteracted = true;
    document.body.classList.add("has-interacted");
  }

  if (!roundActive && getActiveTouches().length === 0) {
    roundFirstPointerId = event.pointerId;
  }

  const { x, y } = normalizeEventPosition(event);
  createTouch(event.pointerId, x, y);
  updateRoundState();
}

function handlePointerMove(event) {
  const touch = touches.get(event.pointerId);
  if (!touch || touch.removing) {
    return;
  }

  if (event.pointerType !== "mouse") {
    event.preventDefault();
  }

  const { x, y } = normalizeEventPosition(event);
  touch.x = x;
  touch.y = y;
  positionTouch(touch);

  if (lockedWinnerId === event.pointerId) {
    syncWinnerMaskPosition(touch);
    if (gifRevealActive) {
      setGifRevealClip(gifRevealRadius, touch.x, touch.y);
    }
  }
}

function handlePointerUp(event) {
  if (arena.hasPointerCapture(event.pointerId)) {
    arena.releasePointerCapture(event.pointerId);
  }

  destroyTouch(event.pointerId);

  if (getActiveTouches().length === 0) {
    document.body.classList.remove("touching");
  }
}

arena.addEventListener("pointerdown", handlePointerDown);
arena.addEventListener("pointermove", handlePointerMove);
arena.addEventListener("pointerup", handlePointerUp);
arena.addEventListener("pointercancel", handlePointerUp);
arena.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse" && event.buttons === 0) {
    handlePointerUp(event);
  }
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && touches.size === 0) {
    document.body.classList.remove("touching");
  }
});

document.addEventListener("contextmenu", preventNativeGesture);
document.addEventListener("gesturestart", preventNativeGesture);
document.addEventListener("gesturechange", preventNativeGesture);
document.addEventListener("gestureend", preventNativeGesture);
document.addEventListener("selectstart", preventNativeGesture);
document.addEventListener("dragstart", preventNativeGesture);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Ignore registration failures on unsupported or insecure contexts.
    });
  });
}
