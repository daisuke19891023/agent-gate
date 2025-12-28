"""Backend application."""


def create_app():
    """Create the application."""
    return {"name": "backend", "version": "0.1.0"}


if __name__ == "__main__":
    app = create_app()
    print(f"Running {app['name']} v{app['version']}")
