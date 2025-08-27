---
title: "RDS Snapshot → S3: Diagnosticar y resolver un Export deshabilitado"
date: 2025-08-27T07:00:00+01:00
hero: /images/posts/rds-to-s3.webp
description: Desbloqueá un Export to S3 deshabilitado para RDS Snapshot con un flujo claro y sin consola. Diagnóstico rápido 🕵️, restore temporal en gp3 🧱, nuevo Snapshot 📸 y export con el wiring correcto de IAM/KMS 🔐.
theme: Toha
menu:
  sidebar:
    name: RDS Snapshot → S3 (Fix Disabled Export)
    identifier: rds-export-to-s3
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

Antes de entrar en el por qué y el cómo, esto es lo que entregamos:

- ⏱️ Diagnóstico claro en menos de un minuto (sin adivinar en la consola)

- 🫥 Camino no intrusivo: solo instancia **temporal** (no tocamos tu RDS actual)

- 🔐 Export que funciona, con la forma correcta de **IAM/KMS** 

- 🧩 Comandos copy-paste para tu runbook o CI 

{{< vs 2 >}}

{{< alert type="success" >}}
Todo esto sin modificar tu instancia actual: restaurás el Snapshot en una instancia **gp3** temporal 🚀, creás un Snapshot nuevo 📸 y exportás ese 📦.
{{< /alert >}}

{{< vs 4 >}}

## Por qué el Export está deshabilitado 🔒
{{< vs 1 >}}
El bloqueo más frecuente es simple: el Snapshot fue tomado desde una instancia con almacenamiento **magnético (`standard`)** 🧲. Los Snapshots con ese linaje **no** son elegibles para Export. La consola es ambigua; el **CLI** te muestra exactamente qué pasa 🧪.

{{< vs 4 >}}

## Console vs CLI: lo que realmente ayuda ⚖️
{{< vs 2 >}}
<div style="display: flex; justify-content: center;">

<table>
<thead>
<tr>
<th></th>
<th>❌ Solo consola</th>
<th>✅ Runbook con CLI</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Feedback</strong></td>
<td>Botón gris, sin motivo claro 😶‍🌫️</td>
<td>Estado y campos explícitos (StorageType, errores) 🧾</td>
</tr>
<tr>
<td><strong>Acciones</strong></td>
<td>Prueba y error 🎯</td>
<td>Flujo determinístico (restore → Snapshot → export) ▶️</td>
</tr>
<tr>
<td><strong>Repeatability</strong></td>
<td>Pasos manuales 🧱</td>
<td>Scriptable & auditable 🤖</td>
</tr>
</tbody>
</table>

</div>

{{< vs 4 >}}

## Diagnóstico rápido (CLI) 🕵️‍♂️
{{< vs 2 >}}
**Revisar el tipo de almacenamiento del Snapshot**
```bash
aws rds describe-db-snapshots   --db-snapshot-identifier <SNAPSHOT_ID>   --query 'DBSnapshots[0].[DBSnapshotIdentifier,Engine,EngineVersion,StorageType,Encrypted,Status]'   --output table
```
{{< vs 2 >}}
{{< alert type="warning" >}}
Si `StorageType` = `standard`, ese Snapshot no se va a exportar.
{{< /alert >}}


{{< vs 4 >}}

## Arquitectura a simple vista 🧭

El flujo es directo: **restore** del Snapshot → **instancia gp3 temporal** → **nuevo Snapshot** → **Export a S3** con un **IAM Role** asumido por `export.rds.amazonaws.com`.

{{< vs 2 >}}

{{< img src="/images/posts/diagram-rds-export-s3.png" align="center" title="Flujo end-to-end para destrabar el Export de RDS Snapshot a S3" >}}

{{< vs 2 >}}

Esto muestra:

- 🔁 Dónde cambia el linaje de almacenamiento (magnético → gp3)

- 🔗 Cómo el servicio de export asume un IAM Role para escribir en un S3 Bucket

- 🧰 Las piezas mínimas (RDS, S3, IAM, KMS opcional)

{{< vs 4 >}}

## Playbook (sin cambios sobre tu RDS existente) 📘
{{< vs 2 >}}
{{< alert type="info" >}}
**No** modificamos tu DB actual. Restauramos el Snapshot en una instancia **SSD** temporal, creamos un **Snapshot** nuevo y exportamos ese.
{{< /alert >}}


{{< vs 2 >}}
### 🧱 Restore del Snapshot en **gp3** (instancia temporal)
```bash
# Vars
export REGION=<REGION>
export TEMP_DB_ID=<TEMP_DB_ID>
export SNAPSHOT_ID=<SNAPSHOT_ID>
export SUBNET_GROUP=<DB_SUBNET_GROUP>
export SG_ID=<SECURITY_GROUP_ID>

aws rds restore-db-instance-from-db-snapshot   --region $REGION   --db-instance-identifier $TEMP_DB_ID   --db-snapshot-identifier $SNAPSHOT_ID   --storage-type gp3   --no-publicly-accessible   --db-subnet-group-name $SUBNET_GROUP   --vpc-security-group-ids $SG_ID
```

{{< vs 2 >}}

### 📸 Crear un **nuevo Snapshot** (ahora SSD)
```bash
export NEW_SNAPSHOT_ID=${TEMP_DB_ID}-exportable-$(date +%Y%m%d)

aws rds create-db-snapshot   --db-snapshot-identifier $NEW_SNAPSHOT_ID   --db-instance-identifier $TEMP_DB_ID

# Sanity check
aws rds describe-db-snapshots   --db-snapshot-identifier $NEW_SNAPSHOT_ID   --query 'DBSnapshots[0].[DBSnapshotIdentifier,StorageType,Status]'   --output table
```

{{< vs 4 >}}

## 🧷 Export a S3 (el wiring que importa)

{{< vs 2 >}}

### ✅ Requerimientos 
- 🌍 S3 Bucket en la **misma región** que el Snapshot

- 🤝 **IAM Role** para Export con trust en `export.rds.amazonaws.com`

- 📝 El Role puede **escribir** en el S3 Bucket (PutObject, ListBucket, GetBucketLocation, etc.) 

- 🔑 Si usás KMS, la KMS Key está **Enabled** y permite al servicio de export 

- 🛑 Sin **SCP** de la Organization bloqueando `rds:StartExportTask`

#### 👇 Trust Policy (asumida por el servicio de export)
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


#### 📜 Minimal Permissions Policy (S3 + KMS)
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

#### 🧾 Bucket Policy (allow explícito para el Role)
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

### ▶️ Iniciar el Export
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

### 👀 Observar la ejecución
{{< vs 1 >}}
```bash
aws rds describe-export-tasks \
  --filters Name=export-task-identifier,Values=export-$NEW_SNAPSHOT_ID \
  --query 'ExportTasks[0].[Status,ProgressPercentage,S3Bucket,S3Prefix,FailureCause]' \
  --output table
```

{{< vs 4 >}}

## Troubleshooting (triage rápido) 🧯

- 🔎 **AccessDenied** → revisá **SCP** de la Organization, permisos del caller y la Policy del IAM Role

- 🧱 **KMSKeyNotAccessible** → KMS Key deshabilitada o algún Deny afectando `export.rds.amazonaws.com`

- 🗺️ **BucketRegionError** → Snapshot y S3 Bucket deben estar en la **misma región**

- 🤝 **Shared snapshot** → alinear accesos/grants de KMS para cross-account

{{< vs 4 >}}

## 💡 Lecciones aprendidas

- No dependas de la consola para explicar el “por qué” — el **CLI** es tu fuente de verdad
- Prevenilo de entrada: estandarizá **gp3** en tus módulos y bloqueá `standard` en CI
- Mantené un **export Role** preaprobado por cuenta/región para evitar IAM ad-hoc

{{< vs 4 >}}

## 🙋‍♂️ ¿Necesitás ayuda con esto?

¿Necesitás ayuda manteniendo tu RDS — Backups restaurables, governance de Snapshots, exports predecibles, etc. ?

Implementamos estos patrones en múltiples cuentas y regiones de AWS — repetibles, auditables y de bajo mantenimiento.

💬 [Hablemos en LinkedIn](https://linkedin.com/in/NSerbin) — encantado de ayudar o intercambiar ideas.
{{< vs 4 >}}
