---
title: "NGINX Out, ALB In - 70% Cheaper Redirects with Zero Servers"
date: 2025-07-14T22:00:00+01:00
hero: /images/posts/hero.webp
description: Descubrí cómo reemplazamos EC2 + NGINX con AWS ALB y Terraform para manejar más de 70 redirecciones serverless — sin servidores, sin downtime y con un 70% menos de costos.
theme: Toha
menu:
  sidebar:
    name: Migrando de NGINX a ALB
    identifier: de-nginx-a-alb
    parent: aws-networking
    weight: 100
tags:
- Load Balancer
- Redirects
- NGINX
- EC2
categories:
- AWS
---

Antes de entrar en el por qué y el cómo, esto es lo que logramos:

- ✅ Reemplazamos un punto único de falla con componentes nativos de AWS

- 💸 Reducimos los costos mensuales en un 70%

- 🧑‍💻 No más SSH, servidores ni reinicios de NGINX

- 🔐 SSL totalmente gestionado con ACM

- 🛠️ Todo codificado y versionado con Terraform

{{< alert type="success" >}}
Todo esto — sin un solo servidor EC2 ni archivo de configuración NGINX.
{{< /alert >}}

{{< vs 3 >}}

## Por qué dejamos EC2 + NGINX (y cuánto nos ahorramos)
{{< vs 1 >}}
Teníamos un objetivo simple: redirigir tráfico de más de 70 dominios diferentes.Primero lo resolvimos con lo que conocíamos — una instancia EC2 corriendo NGINX con reglas 301 y 302 hardcodeadas. Funcionó… hasta que dejó de funcionar.

{{< vs 3 >}}

Lo que empezó como una solución rápida se convirtió en un dolor de cabeza operativo:

- Cualquier nueva redirección requería acceso por SSH y edición manual de archivos
- Reiniciar NGINX implicaba riesgos de downtime
- Un solo typo podía romper todo
- Y lo más importante: estábamos manteniendo un servidor completo solo para manejar redirecciones

{{< vs 2 >}}

Finalmente nos preguntamos: ¿esto no es solo una planilla glorificada con SSL y problemas de uptime?Esa pregunta nos llevó a rediseñar todo con **ALB, Terraform, ACM** y nada más.

Y funcionó — espectacularmente.
{{< vs 4 >}}

### 💰 EC2 vs ALB: El costo de la simplicidad
{{< vs 2 >}}
<div style="display: flex; justify-content: center;">

<table>
<thead>
<tr>
<th></th>
<th>❌ EC2 + NGINX</th>
<th>✅ ALB + Terraform</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Costo</strong></td>
<td>~$73/mes</td>
<td>~$22.50/mes</td>
</tr>
<tr>
<td><strong>Acceso</strong></td>
<td>Requiere SSH/SSM</td>
<td>No requiere SSH/SSM</td>
</tr>
<tr>
<td><strong>SSL</strong></td>
<td>Configuración manual</td>
<td>SSL automático (ACM)</td>
</tr>
<tr>
<td><strong>Mantenimiento</strong></td>
<td>Edición manual de archivos</td>
<td>Totalmente versionado en Terraform</td>
</tr>
<tr>
<td><strong>Escalabilidad</strong></td>
<td>Punto único de falla</td>
<td>Reglas totalmente escalables</td>
</tr>
<tr>
<td><strong>Downtime</strong></td>
<td>Reinicios de NGINX causan downtime</td>
<td>Cero downtime en cambios de reglas</td>
</tr>
</tbody>
</table>

</div>


{{< vs 2 >}}

Eso representa una **reducción de ~70%**, sin servidores que mantener y con escalabilidad total.

{{< vs 4 >}}

## 🛠 La nueva solución: ALB + Terraform + SSL + Logs

Una vez que migramos, queríamos que la solución fuera automatizada, segura y fácil de mantener. Esto fue lo que construimos:

{{< vs 4 >}}

### 📊 Vista general: cómo fluye el tráfico

A veces es más fácil entender este tipo de infraestructura visualmente. Acá tenés un diagrama de alto nivel que muestra cómo viajan los requests del usuario a través de Route 53, el ALB, y cómo se manejan las redirecciones:

{{< vs 2 >}}

{{< img src="/images/posts/diagram-redirect-alb.png" align="center" title="Cómo Route 53 y ALB procesan las solicitudes entrantes" >}}

{{< vs 2 >}}

Este diagrama muestra:  
- Qué pasa cuando alguien accede a un dominio conocido o no registrado
- Cómo Route 53 enruta los requests al ALB
- La diferencia entre el tráfico que llega por el puerto 80 y el puerto 443
- Qué hace el ALB cuando no encuentra una regla de redirección (retorna 404)

{{< vs 4 >}}

### 🔧 Componentes utilizados

- **ALB (Application Load Balancer)**: Maneja todos los requests HTTP/HTTPS 
- **Redirect Listener Rules**: Definen qué se redirige y hacia dónde
- **Route 53**: Hosted Zones ya manejaban el DNS de todos nuestros dominios
- **AWS ACM**: Para emitir y renovar automáticamente los certificados SSL
- **Access Logs**: Activados y enviados a S3 para auditoría
- **Terraform**: Usado para definir toda la infraestructura como código  
- **Modules**: Usamos los módulos de Anton Babenko para [`alb`](https://github.com/terraform-aws-modules/terraform-aws-alb) y [`acm`](https://github.com/terraform-aws-modules/terraform-aws-acm)

{{< vs 4 >}}

### 🔐 Gestión de certificados SSL con ACM

Utilizamos **ACM (AWS Certificate Manager)** para solicitar certificados por dominio, con renovación automática activada. Como ya teníamos los dominios en Route 53, la validación se hizo automáticamente por DNS — sin configuración manual.

{{< vs 2 >}}

Código:

```hcl
module "acm" {
  source  = "terraform-aws-modules/acm/aws"
  version = "~> 4.0"

  domain_name               = "example.com"
  subject_alternative_names = ["www.example.com"]
  zone_id                  = data.aws_route53_zone.main.zone_id
  validate_certificate     = true
}
```

{{< vs 4 >}}
### 🌐 Listener Rules + Redirects con ALB
Implementamos dos listeners:

- Puerto `80` (HTTP): Redirige todo a HTTPS

- Puerto `443` (HTTPS): Procesa reglas de redirect (máximo 100), con acción por defecto `404`

{{< vs 2 >}}

Código:
```hcl
module "redirect_alb" {
  source  = "terraform-aws-modules/alb/aws"
  version = "9.12.0"

  name               = "redirect-alb"
  load_balancer_type = "application"
  internal           = false

  vpc_id  = aws_vpc.main.id
  subnets = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  access_logs = {
    bucket  = aws_s3_bucket.alb_logs.bucket
    enabled = true
    prefix  = "alb-access"
  }

  create_security_group = true
  security_group_ingress_rules = {
    http = {
      from_port   = 80
      to_port     = 80
      ip_protocol = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
    https = {
      from_port   = 443
      to_port     = 443
      ip_protocol = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  http_listeners = [
    {
      port     = 80
      protocol = "HTTP"
      action = {
        type     = "redirect"
        redirect = {
          port        = "443"
          protocol    = "HTTPS"
          status_code = "HTTP_301"
        }
      }
    }
  ]

  https_listeners = [
    {
      port            = 443
      protocol        = "HTTPS"
      certificate_arn = module.acm.certificate_arn
      rules = [
        {
          priority = 10
          actions = [{
            type = "redirect"
            redirect = {
              host        = "www.example.com"
              status_code = "HTTP_301"
              protocol    = "HTTPS"
            }
          }]
          conditions = [{
            host_header = {
              values = ["old-domain.com"]
            }
          }]
        },
        {
          priority = 20
          actions = [{
            type = "redirect"
            redirect = {
              host        = "www.blog.example.com"
              path        = "/blog"
              status_code = "HTTP_301"
              protocol    = "HTTPS"
            }
          }]
          conditions = [{
            host_header = {
              values = ["legacy-blog.net"]
            }
          }]
        }
      ]

      default_action = {
        type = "fixed-response"
        fixed_response = {
          content_type = "text/plain"
          message_body = "Not Found"
          status_code  = "404"
        }
      }
    }
  ]
}
```

{{< vs 4 >}}

### ✨ Por qué funcionó para nosotros
{{< vs 2 >}}
✅ Completamente serverless — sin EC2 que mantener

✅ ~70% de ahorro en costos

✅ Todos los redirects están versionados con Terraform

✅ Certificados SSL gestionados automáticamente (con renovaciones) vía ACM

✅ Logs de acceso habilitados para auditoría

✅ La regla por defecto devuelve 404 para evitar exponer detalles internos

✅ Puerto 80 redirige limpio a HTTPS (443)

✅ Lista para integrar con WAF o CloudWatch en el futuro

✅ Todo es Infrastructure-as-Code, listo para CI/CD


{{< vs 3 >}}

### ❌ Lo Que No Usamos (Y Por Qué)
{{< vs 2 >}}
- **Lambda@Edge** – ideal para lógica compleja a escala, pero excesivo para simples 301. 
- **CloudFront Functions** – menor soporte en Terraform, más limitaciones.
- **S3 Static Hosting** – sin SSL incorporado a menos que se combine con CloudFront. 

_Al final, ganó la simplicidad. ALB cubrió el 100% de nuestro caso de uso — sin Lambda, sin CloudFront._


{{< vs 3 >}}
## 📌 Consejo de Escalado
> AWS ALB soporta hasta **100 listener rules por listener**.  
>  
> Si necesitás más:  
> • 🧩 Usar múltiples listeners (por ejemplo, diferentes puertos o múltiples ALBs)
> • 🚀 Migrá a CloudFront Functions o Lambda@Edge para redirects a gran escala
> • 🗂️ Agrupá redirecciones usando dominios wildcard o patrones de ruta

{{< vs 1 >}}  
_Planificá tu estrategia de redirects desde temprano para evitar cuellos de botella en escalabilidad._

{{< vs 4 >}}

## 💡 Lecciones Aprendidas

- Mantené la infraestructura tan simple como el problema lo requiere — NGINX era excesivo para redirecciones.
- Las reglas de ALB son poderosas, pero no escalan infinitamente. Planificá los límites desde el inicio.
- Terraform hizo que experimentar y hacer rollback fuera seguro y auditable.  
- Depender de servicios gestionados como ACM para SSL eliminó el 90% de la carga operativa.

_En resumen, transformamos un setup frágil en EC2 en un sistema serverless robusto — ahorrando dinero, esfuerzo y dolores de cabeza futuros._

{{< vs 4 >}}

## 🙋‍♂️ ¿Necesitás Ayuda Con Esto?

¿Estás considerando una migración similar o querés simplificar tu setup de redirecciones?

Hemos migrado este mismo patrón en múltiples cuentas de AWS — y el equipo de operaciones nunca miró atrás.

💬 [Hablemos en LinkedIn](https://linkedin.com/in/NSerbin) — encantado de ayudarte o intercambiar ideas.
{{< vs 4 >}}