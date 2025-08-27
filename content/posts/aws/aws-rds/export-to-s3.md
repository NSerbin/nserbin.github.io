---
title: "RDS Snapshot → S3: Diagnose and Fix a Disabled Export"
date: 2025-08-27T07:00:00+01:00
hero: /images/posts/rds-to-s3.webp
description: When the Export to S3 button is greyed out, stop guessing. Confirm the cause in 60 seconds, restore into a temporary gp3 instance, re-snapshot, and export with the right IAM/KMS wiring.
theme: Toha
menu:
  sidebar:
    name: RDS Snapshot → S3 (Fix Disabled Export)
    identifier: export-to-s3
    parent: aws-rds
    weight: 100
tags:
- S3
- RDS
- Storage Type
- Export to S3
- Snapshot
categories:
- AWS
- Databases
- Backup
---

Before diving into the why and how, here’s what we deliver:

- ⏱️ Clear diagnosis in under a minute (no console guesswork) 

- 🫥 Non-intrusive path: **temporary** instance only (we don’t touch your current RDS) 

- 🔐 Export that works, with the correct **IAM/KMS** shape 

- ✅ Copy-paste commands for your runbook or CI 

{{< vs 2 >}}

{{< alert type="success" >}}
All of this without modifying your existing DB instance — restore the snapshot into a temporary **gp3** instance 🚀, create a new snapshot 📸, and export that one 📦.
{{< /alert >}}

{{< vs 4 >}}

## 🔒 Why the export is disabled
{{< vs 1 >}}
The most frequent blocker is simple: the snapshot was taken from an instance on **magnetic storage**. Snapshots with that lineage aren’t eligible for export. The console is vague; the CLI tells you exactly what’s going on.

{{< vs 4 >}}

## ⚖️ Console vs CLI: what actually helps
{{< vs 2 >}}
<div style="display: flex; justify-content: center;">

<table>
<thead>
<tr>
<th></th>
<th>❌ Console only</th>
<th>✅ CLI runbook</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Feedback</strong></td>
<td>Greyed-out button, no reason why</td>
<td>Explicit status & fields (StorageType, errors)</td>
</tr>
<tr>
<td><strong>Actions</strong></td>
<td>Trial and error</td>
<td>Deterministic flow (restore → snapshot → export)</td>
</tr>
<tr>
<td><strong>Repeatability</strong></td>
<td>Manual steps</td>
<td>Scriptable & auditable</td>
</tr>
</tbody>
</table>

</div>

{{< vs 4 >}}

## 🕵️‍♂️ Fast diagnosis (CLI)
{{< vs 2 >}}
**Check the snapshot storage type:**
```bash
aws rds describe-db-snapshots \
  --db-snapshot-identifier <SNAPSHOT_ID> \
  --query 'DBSnapshots[0].[DBSnapshotIdentifier,Engine,EngineVersion,StorageType,Encrypted,Status]' \
  --output table
```
{{< vs 2 >}}
{{< alert type="warning" >}}
If StorageType = *standard*, that snapshot won’t export.
{{< /alert >}}


{{< vs 4 >}}

## 🧭 Architecture at a glance

The flow is straightforward: restore snapshot → temporary gp3 instance → new snapshot → export to S3 with an **export role** trusted by `export.rds.amazonaws.com`.

{{< vs 2 >}}

{{< img src="/images/posts/diagram-rds-export-s3.png" align="center" title="End-to-end flow to unblock RDS snapshot export to S3" >}}

{{< vs 2 >}}

This shows:

- 🔁 Where the storage lineage changes (magnetic → gp3)

- 🔗 How the export service assumes an IAM role to write to S3

- 🧰 The minimal moving parts (RDS, S3, IAM, optional KMS)

{{< vs 4 >}}

## 📘 The playbook (no changes to your existing RDS)

{{< vs 2 >}}
{{< alert type="info" >}}
We **do not** modify the current DB instance. We restore the snapshot into a **temporary** SSD-backed instance, create a **new** snapshot, and export that one.
{{< /alert >}}


{{< vs 2 >}}
### 🧱 Restore the snapshot on **gp3** (temporary instance)
```bash
# Vars
export REGION=<REGION>
export TEMP_DB_ID=<TEMP_DB_ID>
export SNAPSHOT_ID=<SNAPSHOT_ID>
export SUBNET_GROUP=<DB_SUBNET_GROUP>
export SG_ID=<SECURITY_GROUP_ID>

aws rds restore-db-instance-from-db-snapshot \
  --region $REGION \
  --db-instance-identifier $TEMP_DB_ID \
  --db-snapshot-identifier $SNAPSHOT_ID \
  --storage-type gp3 \
  --no-publicly-accessible \
  --db-subnet-group-name $SUBNET_GROUP \
  --vpc-security-group-ids $SG_ID
```

{{< vs 2 >}}

### 📸 Create a **new** snapshot (now SSD-backed)
```bash
export NEW_SNAPSHOT_ID=${TEMP_DB_ID}-exportable-$(date +%Y%m%d)

aws rds create-db-snapshot \
  --db-snapshot-identifier $NEW_SNAPSHOT_ID \
  --db-instance-identifier $TEMP_DB_ID

# Sanity check
aws rds describe-db-snapshots \
  --db-snapshot-identifier $NEW_SNAPSHOT_ID \
  --query 'DBSnapshots[0].[DBSnapshotIdentifier,StorageType,Status]' \
  --output table
```

{{< vs 4 >}}

## 🧷 Export to S3 (the wiring that matters)

{{< vs 2 >}}

### ✅ Requirements
- 🌍 S3 bucket in the **same region** as the snapshot

- 🤝 **Export IAM role** trusted by `export.rds.amazonaws.com`

- 📝 Role permissions to **write to S3** (PutObject, ListBucket, GetBucketLocation, etc.)

- 🔑 If using KMS, key **Enabled** and allows the export service

- 🛑 No Organization **SCP** blocking `rds:StartExportTask`

{{< vs 3 >}}

#### 👇 Trust policy (assumed by the export service)
{{< vs 1 >}}
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { 
        "Service": "export.rds.amazonaws.com" 
        },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

{{< vs 3 >}}

#### 📜 Minimal permissions policy (S3 + KMS)
{{< vs 1 >}}
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject*",
        "s3:AbortMultipartUpload",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:DeleteObject*"
      ],
      "Resource": [
        "arn:aws:s3:::<BUCKET>",
        "arn:aws:s3:::<BUCKET>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:CreateGrant",
        "kms:DescribeKey",
        "kms:Encrypt",
        "kms:GenerateDataKey*"
      ],
      "Resource": "<KMS_KEY_ARN>"
    }
  ]
}

```

{{< vs 3 >}}

#### 🧾 Bucket policy (explicit allow for the role)
{{< vs 1 >}}
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRDSExportWrite",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<ACCOUNT_ID>:role/<RDS_EXPORT_ROLE>"
      },
      "Action": [
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::<BUCKET>",
        "arn:aws:s3:::<BUCKET>/*"
        ]
    }
  ]
}

```

{{< vs 4 >}}

### ▶️ Start the export
{{< vs 1 >}}
```bash
aws rds start-export-task \
  --export-task-identifier export-$NEW_SNAPSHOT_ID \
  --source-arn arn:aws:rds:$REGION:<ACCOUNT_ID>:snapshot:$NEW_SNAPSHOT_ID \
  --s3-bucket-name <BUCKET> \
  --s3-prefix rds-exports/$NEW_SNAPSHOT_ID/ \
  --iam-role-arn arn:aws:iam::<ACCOUNT_ID>:role/<RDS_EXPORT_ROLE> \
  --kms-key-id <KMS_KEY_ARN>
```

{{< vs 4 >}}

### 👀 Observe the run
{{< vs 1 >}}
```bash
aws rds describe-export-tasks \
  --filters Name=export-task-identifier,Values=export-$NEW_SNAPSHOT_ID \
  --query 'ExportTasks[0].[Status,ProgressPercentage,S3Bucket,S3Prefix,FailureCause]' \
  --output table
```

{{< vs 4 >}}

## 🧯 Troubleshooting (quick triage)

- 🔎 **AccessDenied** → check Organization **SCPs**, caller permissions, and the export role policy  
- 🧱 **KMSKeyNotAccessible** → key disabled or a deny affecting `export.rds.amazonaws.com`  
- 🗺️ **BucketRegionError** → snapshot and bucket must be in the **same region**  
- 🤝 **Shared snapshot** → align KMS access/grants cross-account

{{< vs 4 >}}

## 💡 Lessons Learned

- Don’t rely on the console to explain the “why” — the **CLI** is your source of truth  
- Prevent this upfront: standardize on **`gp3`** in modules and block `standard` storage in CI  
- Keep a pre-approved **export role** per account/region to avoid one-off IAM changes

{{< vs 4 >}}

## 🙋‍♂️ Need Help With This?

Need help maintaining your RDS setup - keeping backups restorable, snapshot governance tight, etc. ?

We’ve implemented these patterns across multiple AWS accounts and regions — repeatable, auditable, and low‑touch.

💬 [Let’s chat on LinkedIn](https://linkedin.com/in/NSerbin) — happy to help or exchange ideas.
{{< vs 4 >}}