# Sentinel — Self-Healing Application Deployment Platform

Sentinel is a DevOps project that monitors a containerized web application, detects application failures, and automatically attempts to restore service by restarting the unhealthy container. It provides a monitoring dashboard using Prometheus and Grafana to observe application metrics and performance.

## Features

- **Application health monitoring:** Checks whether the Flask application is healthy.
- **Automated recovery:** A separate recovery controller detects an unhealthy application container and attempts to restart it.
- **Failure simulation:** Deliberately trigger a test failure to demonstrate the self-healing mechanism.
- **Prometheus monitoring:** Collects and stores application metrics.
- **Grafana visualization:** Displays monitoring metrics in charts and dashboards.
- **Live web dashboard:** Shows application status, failure counts, recovery events, and monitoring information.
- **Docker containerization:** Runs the application and supporting services using Docker Compose.
- **Automated CI:** GitHub Actions runs project checks and builds Docker images.

## Technology Stack

| Technology | Purpose |
|---|---|
| Python | Application and recovery logic |
| Flask | Web application and API endpoints |
| Gunicorn | Runs the Flask application |
| Docker | Packages the application into a container |
| Docker Compose | Runs and manages the project services |
| Prometheus | Collects and stores metrics |
| Grafana | Visualizes metrics through dashboards |
| Git and GitHub | Version control and source code hosting |
| GitHub Actions | Continuous integration and automated checks |

## Architecture

The project consists of four main components:

1. **Flask application:** Serves the web dashboard, exposes health-check and metrics endpoints, and records application events.
2. **Recovery controller:** Monitors the application container and attempts a restart when an unhealthy state is detected.
3. **Prometheus:** Scrapes the configured metrics endpoint and stores time-series data.
4. **Grafana:** Uses Prometheus as a data source to display application metrics and performance charts.

### Recovery workflow

1. The application runs inside a Docker container.
2. The health-check mechanism detects an unhealthy application.
3. The recovery controller observes the unhealthy state.
4. The controller attempts to restart the application container.
5. The application starts again and undergoes health checks.
6. Once healthy, recovery events can be viewed in the Sentinel dashboard.
7. Prometheus and Grafana help monitor application metrics during normal operation and testing.

## Project Structure

```text
self-healing-application/
├── app.py
├── Dockerfile
├── compose.yaml
├── requirements.txt
├── templates/
│   └── index.html
├── static/
│   ├── app.js
│   └── style.css
├── recovery/
│   ├── Dockerfile
│   └── [recovery controller source files]
├── monitoring/
│   └── prometheus.yml
├── data/
├── .github/
│   └── workflows/
└── README.md
```

The recovery source files, workflow filenames, and other entries above should be checked against the actual repository before publishing.

## Prerequisites

Install the following before running the project:

- Git
- Docker Desktop with Docker Compose
- A web browser

## Run Locally

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd self-healing-application
```

Replace the placeholder with your actual GitHub repository URL.

### 2. Start the services

```bash
docker compose up -d --build
```

This builds the application and starts the configured containers.

### 3. Open the dashboards

| Service | Local URL |
|---|---|
| Sentinel application | http://localhost:8080 |
| Prometheus | http://localhost:9090 |
| Prometheus targets | http://localhost:9090/targets |
| Grafana | http://localhost:3000 |

The Grafana dashboard is also embedded in the Sentinel application's Monitoring section, subject to Grafana's embedding and authentication configuration.

### 4. View container status

```bash
docker compose ps
```

### 5. View application logs

```bash
docker compose logs -f app
```

View the recovery controller logs:

```bash
docker compose logs -f recovery-controller
```

### 6. Stop the services

```bash
docker compose down
```

## Application Endpoints

| Endpoint | Purpose |
|---|---|
| `/` | Displays the Sentinel web dashboard |
| `/health` | Reports application health |
| `/api/status` | Provides application status information |
| `/api/events` | Returns recorded recovery and system events |
| `/api/check` | Runs the configured manual health check |
| `/metrics` | Exposes application metrics for Prometheus |
| `/simulate-failure` | Triggers the configured failure simulation |

The failure simulation endpoint is intended for local testing. Verify the application's route definitions for the supported HTTP methods before calling it directly.

## How to Test Self-Healing

1. Start the project with Docker Compose.
2. Open the Sentinel dashboard at `http://localhost:8080`.
3. Confirm that the application is healthy.
4. Click **Simulate application failure**.
5. Watch the recovery events on the dashboard.
6. Check the recovery controller logs to confirm failure detection and the restart attempt.
7. Confirm that the application becomes healthy again.
8. Open Grafana and inspect the available metrics over a short time range, such as the last 5 or 15 minutes.
9. Open the Prometheus Targets page and verify that the application metrics target is `UP`.

A successful test should demonstrate the failure, recovery attempt, and return to a healthy state. Graphs depend on the metrics collected and the time range selected.

## Monitoring Metrics

The configured Grafana dashboard may display metrics such as:

- Application health
- Total HTTP requests
- HTTP request rate
- Average request duration
- Simulated failure counts

The actual metrics and their values depend on the application's instrumentation and the Grafana panel queries.

## Continuous Integration

GitHub Actions is used to automate project checks and Docker image builds. This helps identify errors before changes are merged or published.

The exact jobs and tests depend on the workflow configuration in `.github/workflows/`.

## Security Considerations

- Do not commit real passwords, API keys, tokens, or other credentials.
- Store local secrets in environment variables or an appropriately excluded `.env` file.
- Use safe placeholder values in example configuration files.
- Restrict access to the Docker socket because it provides powerful control over the Docker host.
- Do not expose the failure simulation endpoint publicly without suitable access controls.
- Configure Grafana authentication and dashboard access appropriately.

## Future Improvements

- Deploy the platform on a cloud virtual machine.
- Add alerts for prolonged application failures.
- Add dashboards for CPU, memory, and container resource usage.
- Add authentication and authorization for recovery controls.
- Improve deployment automation with a complete CI/CD pipeline.

## Author

Developed as a DevOps learning project to demonstrate containerization, application health monitoring, automated recovery, metrics collection, visualization, and continuous integration.
