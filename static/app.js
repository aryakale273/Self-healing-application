
const REFRESH_INTERVAL = 3000;

const elements = {
  refreshBtn: document.getElementById("refreshBtn"),
  statusValue: document.getElementById("statusValue"),
  statusDescription: document.getElementById("statusDescription"),
  containerValue: document.getElementById("containerValue"),
  failureValue: document.getElementById("failureValue"),
  healthPill: document.getElementById("healthPill"),
  healthRing: document.getElementById("healthRing"),
  healthIcon: document.getElementById("healthIcon"),
  healthTitle: document.getElementById("healthTitle"),
  healthMessage: document.getElementById("healthMessage"),
  lastUpdated: document.getElementById("lastUpdated"),
  simulateBtn: document.getElementById("simulateBtn"),
  actionMessage: document.getElementById("actionMessage"),
  eventList: document.getElementById("eventList"),
  checkBtn: document.getElementById("checkBtn"),
};

let previousStatus = null;
let requestInProgress = false;

function setText(element, value) {
  if (element) element.textContent = value;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Time unavailable";

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleString();
}

function showMessage(message, type = "info") {
  if (!elements.actionMessage) return;

  elements.actionMessage.textContent = message;
  elements.actionMessage.dataset.type = type;
  elements.actionMessage.classList.remove("success", "error", "info");
  elements.actionMessage.classList.add(type);
}

function setButtonLoading(button, loading, originalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : originalText;
}

function updateHealthUI(status, details = {}) {
  const healthy = status === "healthy";
  const label = healthy ? "Healthy" : "Unhealthy";

  setText(elements.statusValue, label);
  setText(
    elements.statusDescription,
    healthy
      ? "Application is responding normally."
      : "Application is unhealthy. Recovery may be in progress."
  );

  setText(elements.healthPill, label);
  if (elements.healthPill) {
    elements.healthPill.dataset.status = status;
  }

  if (elements.healthRing) {
    elements.healthRing.dataset.status = status;
  }

  setText(elements.healthIcon, healthy ? "✓" : "!");
  setText(elements.healthTitle, `Application ${label}`);
  setText(
    elements.healthMessage,
    healthy
      ? "The application health check reports healthy."
      : "The application health check reports unhealthy. Check the recovery events."
  );

  if (details.response_time_ms !== undefined) {
    setText(
      document.getElementById("responseTime"),
      `${details.response_time_ms} ms`
    );
  }

  if (previousStatus !== null && previousStatus !== status) {
    showMessage(
      `Application status changed to ${label.toLowerCase()}.`,
      healthy ? "success" : "error"
    );
  }

  previousStatus = status;
}

function updateStatusUI(data) {
  updateHealthUI(data.status, data);

  setText(elements.containerValue, data.container || "shp-app");
  setText(elements.failureValue, data.failure_count ?? 0);
  setText(
    elements.lastUpdated,
    `Last updated: ${formatTimestamp(data.timestamp)}`
  );
}

function eventLabel(type) {
  const labels = {
    CONTROLLER_STARTED: "Recovery controller started",
    FAILURE_INJECTED: "Test failure injected",
    UNHEALTHY_DETECTED: "Unhealthy state detected",
    RESTART_INITIATED: "Container restart initiated",
    RECOVERY_SUCCEEDED: "Application recovery succeeded",
    CONTAINER_STOPPED: "Container stopped",
    CONTAINER_NOT_FOUND: "Container not found",
    DOCKER_API_ERROR: "Docker API error",
    MANUAL_HEALTH_CHECK: "Manual health check",
  };

  return labels[type] || String(type || "System event").replaceAll("_", " ");
}

function eventClass(type) {
  if (["RECOVERY_SUCCEEDED", "CONTROLLER_STARTED"].includes(type)) {
    return "success";
  }

  if (
    [
      "FAILURE_INJECTED",
      "UNHEALTHY_DETECTED",
      "CONTAINER_STOPPED",
      "DOCKER_API_ERROR",
      "CONTAINER_NOT_FOUND",
    ].includes(type)
  ) {
    return "error";
  }

  return "info";
}

function renderEvents(events) {
  if (!elements.eventList) return;

  elements.eventList.replaceChildren();

  if (!events || events.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No events recorded yet.";
    empty.className = "event-empty";
    elements.eventList.appendChild(empty);
    return;
  }

  events.slice(0, 50).forEach((event) => {
    const item = document.createElement("li");
    item.className = "event-item";

    const marker = document.createElement("span");
    marker.className = `event-marker ${eventClass(event.type)}`;
    marker.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "event-content";

    const heading = document.createElement("strong");
    heading.textContent = eventLabel(event.type);

    const message = document.createElement("p");
    message.textContent = event.message || "";

    const time = document.createElement("small");
    time.textContent = formatTimestamp(event.timestamp);

    content.append(heading, message, time);
    item.append(marker, content);
    elements.eventList.appendChild(item);
  });
}

async function getJSON(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

async function refreshStatus() {
  if (requestInProgress) return;
  requestInProgress = true;

  try {
    const data = await getJSON("/api/status");
    updateStatusUI(data);
  } catch (error) {
    console.error("Status refresh failed:", error);
    setText(elements.statusValue, "Unavailable");
    setText(elements.healthPill, "UNAVAILABLE");
    setText(elements.healthTitle, "Health status unavailable");
    setText(elements.healthMessage, "Could not retrieve application status.");
  } finally {
    requestInProgress = false;
  }

  try {
    const data = await getJSON("/api/events");
    renderEvents(data.events || []);
  } catch (error) {
    console.error("Event refresh failed:", error);
  }
}

async function runHealthCheck() {
  setButtonLoading(elements.checkBtn, true, "✓ Run Health Check");

  try {
    // This endpoint must return JSON containing the health-check result.
    const data = await getJSON("/api/check");

    if (data.status) {
      updateHealthUI(data.status, data);
    }

    showMessage(
      data.status === "healthy"
        ? `Health check passed${data.response_time_ms !== undefined
            ? ` in ${data.response_time_ms} ms`
            : ""}.`
        : `Health check result: ${data.status || "unknown"}.`,
      data.status === "healthy" ? "success" : "error"
    );

    await refreshStatus();
  } catch (error) {
    console.error("Health check failed:", error);
    showMessage(
      `Health check failed: ${error.message}. Verify the /api/check endpoint.`,
      "error"
    );
  } finally {
    setButtonLoading(elements.checkBtn, false, "✓ Run Health Check");
  }
}

async function simulateFailure() {
  setButtonLoading(
    elements.simulateBtn,
    true,
    "⚡ Simulate application failure"
  );

  try {
    const data = await getJSON("/simulate-failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    showMessage(
      data.message || "Failure injected. Waiting for automatic recovery...",
      "info"
    );

    // Continue refreshing while the recovery controller responds.
    await refreshStatus();
  } catch (error) {
    console.error("Failure simulation failed:", error);
    showMessage(
      `Could not simulate failure: ${error.message}. Check the backend route.`,
      "error"
    );
  } finally {
    setButtonLoading(
      elements.simulateBtn,
      false,
      "⚡ Simulate application failure"
    );
  }
}

if (elements.refreshBtn) {
  elements.refreshBtn.addEventListener("click", refreshStatus);
}

if (elements.checkBtn) {
  elements.checkBtn.addEventListener("click", runHealthCheck);
}

if (elements.simulateBtn) {
  elements.simulateBtn.addEventListener("click", simulateFailure);
}

refreshStatus();
window.setInterval(refreshStatus, REFRESH_INTERVAL);
