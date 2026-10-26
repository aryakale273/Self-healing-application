
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import docker
from docker.errors import DockerException, NotFound

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [RECOVERY] %(levelname)s: %(message)s",
)

TARGET_CONTAINER = "shp-app"
CHECK_INTERVAL = 5
RESTART_COOLDOWN = 30
EVENT_FILE = Path(os.getenv("EVENT_FILE", "/data/events.jsonl"))

client = docker.from_env()
last_restart = 0
recovery_pending = False
unhealthy_reported = False


def record_event(event_type, message, details=None):
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": event_type,
        "message": message,
        "details": details or {},
    }

    try:
        EVENT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with EVENT_FILE.open("a", encoding="utf-8") as file:
            file.write(json.dumps(event) + "\n")
    except OSError as error:
        logging.error("Could not write event history: %s", error)

    logging.info("%s: %s", event_type, message)


def check_and_recover():
    global last_restart, recovery_pending, unhealthy_reported

    try:
        container = client.containers.get(TARGET_CONTAINER)
        container.reload()

        state = container.attrs["State"]
        status = state["Status"]
        health = state.get("Health", {}).get("Status", "not-configured")

        logging.info("Container status=%s, health=%s", status, health)

        if status != "running":
            if time.time() - last_restart < RESTART_COOLDOWN:
                return

            record_event(
                "CONTAINER_STOPPED",
                "Application container is stopped; attempting to start it.",
                {"container": TARGET_CONTAINER, "status": status},
            )
            container.start()
            last_restart = time.time()
            recovery_pending = True
            return

        if health == "unhealthy":
            if not unhealthy_reported:
                record_event(
                    "UNHEALTHY_DETECTED",
                    "Docker health check reports the application is unhealthy.",
                    {"container": TARGET_CONTAINER},
                )
                unhealthy_reported = True

            if time.time() - last_restart < RESTART_COOLDOWN:
                return

            record_event(
                "RESTART_INITIATED",
                "Recovery controller is restarting the application container.",
                {"container": TARGET_CONTAINER},
            )

            container.restart(timeout=10)
            last_restart = time.time()
            recovery_pending = True
            return

        if health == "healthy":
            unhealthy_reported = False

            if recovery_pending:
                record_event(
                    "RECOVERY_SUCCEEDED",
                    "Application container is healthy again after recovery.",
                    {"container": TARGET_CONTAINER},
                )
                recovery_pending = False

    except NotFound:
        record_event(
            "CONTAINER_NOT_FOUND",
            "Recovery controller could not find the target container.",
            {"container": TARGET_CONTAINER},
        )
    except DockerException as error:
        logging.error("Docker API error: %s", error)
        record_event(
            "DOCKER_API_ERROR",
            "Recovery controller encountered a Docker API error.",
            {"error": str(error)},
        )


if __name__ == "__main__":
    logging.info("Self-healing controller started.")
    record_event(
        "CONTROLLER_STARTED",
        "Self-healing recovery controller started.",
        {"container": TARGET_CONTAINER},
    )

    while True:
        check_and_recover()
        time.sleep(CHECK_INTERVAL)
