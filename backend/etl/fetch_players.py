import os
import shutil


LOCAL_SOURCES = [
    os.path.join("my-project", "data", "merged_player_data.csv"),
    os.path.join("my-project", "public", "merged_player_data.csv"),
    os.path.join("public", "merged_player_data.csv"),
]


def ensure_merged_csv() -> str:
    dest = os.path.join("my-project", "data", "merged_player_data.csv")
    os.makedirs(os.path.dirname(dest), exist_ok=True)

    # If already present, do nothing
    if os.path.exists(dest):
        return dest

    # Try to copy from any local source in repo
    for src in LOCAL_SOURCES:
        if os.path.exists(src):
            shutil.copyfile(src, dest)
            return dest

    raise FileNotFoundError("No local merged_player_data.csv found in repo.")


if __name__ == "__main__":
    path = ensure_merged_csv()
    print(f"Ensured dataset at: {path}")


