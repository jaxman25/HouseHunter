# Disaster Recovery & Backups — House Hunter

Operational runbook for the Firebase backend (Cloud Firestore data, Storage
images, Auth). Follow it when setting up backups, restoring after data loss,
or auditing recovery readiness.

---

## 1. Recovery objectives

| Metric | Target | Notes |
|---|---|---|
| **RPO** (max data loss) | ≤ 24 h | Daily automated Firestore export |
| **RTO** (max downtime) | < 1 h | Firestore import is minutes at this dataset size |
| Backup frequency | Daily, 00:00 UTC | Cloud Scheduler |
| Retention | 30 days | GCS lifecycle rule |

---

## 2. What is backed up

| Asset | Where | Backup |
|---|---|---|
| Firestore documents | `users`, `properties`, `conversations` + `messages`, `notifications`, `counters` | **Yes — automated** (below) |
| Property / chat / avatar images | Firebase Storage (GCS) | Durable by GCS; enable bucket **versioning** if object overwrites are a risk |
| Auth accounts | Firebase Auth | Managed by Firebase (not exportable via `firestore export`); re-create via console or a user dump script |

---

## 3. Automated backups (Cloud Scheduler → Pub/Sub → Cloud Function)

Firestore's export must be triggered by a job. The setup below schedules a
daily export of the whole database to a GCS bucket.

### 3.1 Backup bucket

```bash
# Create the bucket (one-time). Region: use a multi-region for durability.
gcloud storage buckets create gs://househunter-backups --location=US

# Retention: delete exports older than 30 days.
cat > lifecycle.json <<'EOF'
{
  "rule": [
    { "action": { "type": "Delete" }, "condition": { "age": 30 } }
  ]
}
EOF
gcloud storage buckets update gs://househunter-backups --lifecycle-file=lifecycle.json
```

### 3.2 Scheduled exporter (Cloud Function v2)

The Function calls Firestore's managed export REST API with an identity-token
credential, so no service-account key is stored in the repo.

```js
// functions/backupFirestore/index.js (deploy with the gcloud command below)
const { GoogleAuth } = require('google-auth-library');

exports.backupFirestore = async (event) => {
  const projectId = process.env.GCLOUD_PROJECT;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputUriPrefix = `gs://househunter-backups/firestore/${stamp}`;

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore'] });
  const client = await auth.getClient();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`;

  const res = await client.request({
    url,
    method: 'POST',
    data: { outputUriPrefix },
  });
  console.log(`Export started: ${outputUriPrefix} (operation ${res.data.name})`);
};
```

```bash
# Deploy the function (run from the functions/ directory, after npm i google-auth-library)
gcloud functions deploy backupFirestore \
  --gen2 --runtime=nodejs20 --region=us-central1 \
  --trigger-topic=firestore-backup \
  --entry-point=backupFirestore \
  --timeout=540s

# Create the daily trigger
gcloud scheduler jobs create pubsub firestore-backup-daily \
  --schedule="0 0 * * *" \
  --topic=firestore-backup \
  --message-body="backup" \
  --location=us-central1
```

> Alerting: if the export fails, Cloud Scheduler retries with backoff; add a
> log-based alert on `severity >= ERROR` and `resource.type=cloud_function`
> (name `backupFirestore`) so a failed backup pages someone.

---

## 4. Restore runbook

> Restoring **overwrites** the target database. Always restore to a scratch
> project first, verify, then restore to production during a maintenance window.

### 4.1 List available exports

```bash
gcloud storage ls gs://househunter-backups/firestore/
```

### 4.2 Restore to a scratch project (verify first)

```bash
gcloud firestore import gs://househunter-backups/firestore/<export-timestamp> \
  --project=<scratch-project-id>
```

Checklist before trusting the data:

- [ ] Users can sign in and their profiles/favorites load.
- [ ] Property listings render (spot-check newest + a filtered search + a map).
- [ ] A conversation thread and its messages open.
- [ ] Notification counts / read state look sane.
- [ ] Document counts match the source (compare `count(*)` aggregates).

### 4.3 Restore to production

```bash
# Maintenance window; disable writes first (or accept the small write window)
gcloud firestore import gs://househunter-backups/firestore/<export-timestamp>
```

After import:

- [ ] Smoke-test the app end to end (login, browse, chat, settings).
- [ ] Confirm Firebase Storage images still resolve (they are not part of the
      import — only Firestore is).
- [ ] Post-incident review: root cause, whether the 24 h RPO held, runbook fixes.

---

## 5. Partial restores

Firestore's managed export/import is **database-wide**. For single-document or
single-user recovery:

1. Query the export from the scratch project (step 4.2), or keep a lightweight
   nightly dump of `users` only if you frequently need single-user restores.
2. Re-create the affected document(s) via a script or console copy.

---

## 6. Testing & ownership

- **Quarterly restore drill**: run steps 4.1–4.2 against a scratch project and
  record the time-to-restore. Keep the checklist result in the repo
  (`docs/DR_DRILL_LOG.md`).
- **Owners**: document who can run restores and who approves a production
  restore (two-person rule recommended).
- **Keys**: the exporter uses workload identity via `GoogleAuth` — no long-lived
  service-account keys. Rotate GCS bucket permissions on offboarding.

---

## 7. Related

- Composite indexes are recreated automatically during export/import — but the
  app expects them configured, so redeploy `firestore.indexes.json` after
  restoring to a fresh project (`npx firebase-tools deploy --only firestore:indexes`).
- Security rules are **not** exported with data — redeploy `firestore.rules`
  after restoring to a fresh project.
