
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
  responseTime: document.getElementById("responseTime"),
  checkBtn: document.getElementById("checkBtn"),
};

let previousStatus = null;
let requestInProgress = false;

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Time unavailable";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString();
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

function updateStatusUI(data) {
  const healthy = data.status === "healthy";
  const statusText = healthy ? "Healthy" : "Unhealthy";

  setText(elements.statusValue, statusText);
  setText(
    elements.statusDescription,
    healthy
      ? "Application is responding normally."
      : "Application failure detected. Recovery may be in progress."
  );

  setText(elements.containerValue, data.container || "shp-app");
  setText(elements.failureValue, data.failure_count ?? 0);
  setText(
    elements.lastUpdated,
    `Last updated: ${formatTimestamp(data.timestamp)}`
  );

  if (elements.responseTime) {
    setText(
      elements.responseTime,
      `${data.response_time_ms ?? "—"} ms`
    );
  }

  if (elements.healthPill) {
    setText(elements.healthPill, statusText);
    elements.healthPill.dataset.status = data.status;
  }

  if (elements.healthRing) {
    elements.healthRing.dataset.status = data.status;
  }

  if (elements.healthIcon) {
    setText(elements.healthIcon, healthy ? "✓" : "!");
  }

  setText(elements.healthTitle, `Application ${statusText}`);
  setText(
    elements.healthMessage,
    healthy
      ? "The application health endpoint is reporting healthy."
      : "A test failure or application issue is active. Check the recovery events."
  );

  if (previousStatus !== null && previousStatus !== data.status) {
    showMessage(
      `Application status changed to ${statusText.toLowerCase()}.`,
      healthy ? "success" : "error"
    );
  }

  previousStatus = data.status;
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
  if (
    type === "RECOVERY_SUCCEEDED" ||
    type === "CONTROLLER_STARTED"
  ) {
    return "success";
  }

  if (
    type === "FAILURE_INJECTED" ||
    type === "UNHEALTHY_DETECTED" ||
    type === "CONTAINER_STOPPED" ||
    type === "DOCKER_API_ERROR" ||
    type === "CONTAINER_NOT_FOUND"
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

async function refreshStatus() {
  if (requestInProgress) return;

  requestInProgress = true;

  try {
    const response = await fetch("/api/status", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Status request failed (${response.status})`);
    }

    const data = await response.json();
    updateStatusUI(data);
  } catch (error) {
    console.error("Could not refresh application status:", error);
    setText(elements.statusValue, "Unavailable");
    setText(elements.statusDescription, "Unable to retrieve application status.");
    showMessage("Could not load live status. Check the app container.", "error");
  } finally {
    requestInProgress = false;
  }

  try {
    const response = await fetch("/api/events", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Events request failed (${response.status})`);
    }

    const data = await response.json();
    renderEvents(data.events || []);
  } catch (error) {
    console.error("Could not load event history:", error);
  }
}

async function simulateFailure() {
  if (!elements.simulateBtn) return;

  const originalText = "Simulate Failure";
  setButtonLoading(elements.simulateBtn, true, originalText);

  try {
    const response = await fetch("/simulate-failure", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not simulate failure.");
    }

    showMessage(
      "Test failure injected. Waiting for Docker health checks and recovery...",
      "success"
    );

    await refreshStatus();
  } catch (error) {
    showMessage(error.message || "Failure simulation failed.", "error");
  } finally {
    setButtonLoading(elements.simulateBtn, false, originalText);
  }
}

async function runHealthCheck() {
  if (elements.checkBtn) {
    setButtonLoading(elements.checkBtn, true, "Run Health Check");
  }

  try {
    const response = await fetch("/api/check", {
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(
        `Health check: ${data.status || "unhealthy"}. Check the recovery timeline.`,
        "error"
      );
    } else {
      showMessage(
        `Health check passed in ${data.response_time_ms} ms.`,
        "success"
      );
    }

    await refreshStatus();
  } catch (error) {
    showMessage("Unable to run the health check.", "error");
  } finally {
    if (elements.checkBtn) {
      setButtonLoading(elements.checkBtn, false, "Run Health Check");
    }
  }
}

if (elements.refreshBtn) {
  elements.refreshBtn.addEventListener("click", async () => {
    showMessage("Refreshing monitoring data...", "info");
    await refreshStatus();
  });
}

if (elements.simulateBtn) {
  elements.simulateBtn.addEventListener("click", simulateFailure);
}

if (elements.checkBtn) {
  elements.checkBtn.addEventListener("click", runHealthCheck);
}

refreshStatus();
window.setInterval(refreshStatus, REFRESH_INTERVAL);
