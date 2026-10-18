import os
import pandas as pd
import numpy as np

def load_and_augment_data(raw_dir: str = None, fixture_path: str = None):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if raw_dir is None:
        raw_dir = os.path.join(base_dir, "data", "raw")
    if fixture_path is None:
        fixture_path = os.path.join(base_dir, "tests", "fixtures", "synthetic_triage_data.csv")

    # Check if raw dataset is provided by user
    data_file = None
    if os.path.exists(raw_dir):
        raw_files = [os.path.join(raw_dir, f) for f in os.listdir(raw_dir) if f.endswith(".csv")]
        if raw_files:
            data_file = raw_files[0]
            print(f"Loading user dataset: {data_file}")

    if not data_file:
        print(f"data/raw/ is empty. Using labelled synthetic fixture: {fixture_path}")
        data_file = fixture_path

    # Read CSV, skipping comment lines
    df = pd.read_csv(data_file, comment="#")

    # Metadata columns
    meta_cols = ["disease", "syndrome", "base_risk", "specialty"]
    symptom_cols = [c for c in df.columns if c not in meta_cols]

    # Data augmentation per Section 11.8:
    # Synthesize realistic rural noise: random symptom dropout (20-40%) and occasional noise
    augmented_rows = []
    
    # Base replication to generate sufficient training instances
    n_replicas = 30
    for _ in range(n_replicas):
        for _, row in df.iterrows():
            new_row = row.copy()
            # Symptom dropout (20% to 40%)
            dropout_rate = np.random.uniform(0.20, 0.40)
            for sym in symptom_cols:
                if new_row[sym] == 1 and np.random.rand() < dropout_rate:
                    new_row[sym] = 0
                # Random noise symptom (5% chance of spurious symptom)
                elif new_row[sym] == 0 and np.random.rand() < 0.05:
                    new_row[sym] = 1
            augmented_rows.append(new_row)

    augmented_df = pd.DataFrame(augmented_rows)
    return augmented_df, symptom_cols, meta_cols

if __name__ == "__main__":
    df, syms, metas = load_and_augment_data()
    print(f"Prepared {len(df)} augmented training samples with {len(syms)} symptoms.")
