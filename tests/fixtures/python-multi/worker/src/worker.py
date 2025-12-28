"""Worker module."""


def process_task(task_id: str) -> dict:
    """Process a task."""
    return {"task_id": task_id, "status": "completed"}


if __name__ == "__main__":
    result = process_task("test-001")
    print(f"Task result: {result}")
