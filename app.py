
from flask import Flask, jsonify, render_template, Response, request, g
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from time import perf_counter
from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
)
import json
import os

app = Flask(__name__)

EVENT_FILE = Path(os.getenv("EVENT_FILE", "/data/events.jsonl"))
event_lock = Lock()

app_state = {
    "healthy": True,
    "failure_count": 0,
}

# Prometheus metrics
HTTP_REQUESTS = Counter(
    "shp_http_requests_total",
    "Total HTTP requests handled by the application",
    ["method", "endpoint", "status"],
)

HTTP_REQUEST_DURATION = Histogram(
    "shp_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["endpoint"],
)

SIMULATED_FAILURES = Counter(
    "shp_simulated_failures_total",
    "Total simulated application failures",
)

MANUAL_HEALTH_CHECKS = Counter(
    "shp_manual_health_checks_total",
    "Total manual health checks",
    ["result"],
)

APP_HEALTH = Gauge(
    "shp_application_healthy",
    "Application health: 1 means healthy, 0 means unhealthy",
)

APP_HEALTH.set(1)


def now():
    return datetime.now(timezone.utc).isoformat()


def record_event(event_type, message, details=None):
    event = {
        "timestamp": now(),
        "type": event_type,
        "message": message,
        "details": details or {},
    }

    try:
        EVENT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with event_lock:
            with EVENT_FILE.open("a", encoding="utf-8") as file:
                file.write(json.dumps(event) + "\n")
    except OSError as error:
        app.logger.error("Could not write event history: %s", error)

    return event


def read_events(limit=100):
    try:
        if not EVENT_FILE.exists():
            return []

        with event_lock:
            lines = EVENT_FILE.read_text(encoding="utf-8").splitlines()

        events = []
        for line in lines[-limit:]:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue

        return list(reversed(events))
    except OSError as error:
        app.logger.error("Could not read event history: %s", error)
        return []


@app.before_request
def start_request_timer():
    g.request_started_at = perf_counter()


@app.after_request
def record_request_metrics(response):
    endpoint = request.endpoint or "unknown"

    if endpoint != "prometheus_metrics":
        elapsed = perf_counter() - getattr(
            g, "request_started_at", perf_counter()
        )

        HTTP_REQUESTS.labels(
            request.method,
            endpoint,
            str(response.status_code),
        ).inc()

        HTTP_REQUEST_DURATION.labels(endpoint).observe(elapsed)

    return response


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/status")
def api_status():
    healthy = app_state["healthy"]

    return jsonify({
        "application": "Self-Healing Platform",
        "status": "healthy" if healthy else "unhealthy",
        "container": "shp-app",
        "failure_count": app_state["failure_count"],
        "simulation_enabled": (
            os.getenv("ENABLE_FAILURE_SIMULATION", "false").lower()
            == "true"
        ),
        "timestamp": now(),
    })


@app.route("/api/events")
def api_events():
    return jsonify({"events": read_events()})


@app.route("/api/check")
def api_check():
    started = perf_counter()
    healthy = app_state["healthy"]
    elapsed = round((perf_counter() - started) * 1000, 2)
    result = "healthy" if healthy else "unhealthy"

    MANUAL_HEALTH_CHECKS.labels(result).inc()

    event = record_event(
        "MANUAL_HEALTH_CHECK",
        f"Manual health check: {result}",
        {"status": result, "response_time_ms": elapsed},
    )

    return jsonify({
        "status": result,
        "response_time_ms": elapsed,
        "event": event,
    }), 200 if healthy else 503


@app.route("/health")
def health():
    if not app_state["healthy"]:
        APP_HEALTH.set(0)
        return jsonify({"status": "unhealthy"}), 500

    APP_HEALTH.set(1)
    return jsonify({"status": "healthy"}), 200


@app.route("/metrics")
def prometheus_metrics():
    return Response(
        generate_latest(),
        mimetype=CONTENT_TYPE_LATEST,
    )


@app.route("/simulate-failure", methods=["GET", "POST"])
def simulate_failure():
    enabled = (
        os.getenv("ENABLE_FAILURE_SIMULATION", "false").lower()
        == "true"
    )

    if not enabled:
        return jsonify({
            "error": "Failure simulation is disabled"
        }), 404

    if app_state["healthy"]:
        app_state["failure_count"] += 1
        app_state["healthy"] = False
        APP_HEALTH.set(0)
        SIMULATED_FAILURES.inc()

        record_event(
            "FAILURE_INJECTED",
            "A test failure was injected into the application.",
            {"failure_count": app_state["failure_count"]},
        )

    return jsonify({
        "message": "Failure simulated. Recovery controller will respond.",
        "failure_count": app_state["failure_count"],
    }), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
