---
title: "We replaced an NGINX server with AWS ALB for 50+ redirects — and cut costs by 70%"
date: 2025-07-14T10:00:00+01:00
hero: /images/posts/redirects-with-alb/alb-redirects-cover.png
description: Discover how we simplified and automated dozens of HTTP redirects using AWS ALB, ACM and Terraform. Zero servers, automatic SSL, and full scalability.
author:
  name: Nicolas Serbin
  image: /images/authors/perfil.png
menu:
  sidebar:
    name: Migrating from NGINX to ALB
    identifier: alb-nginx-migration
    parent: aws-networking
    weight: 1
tags:
- Load Balancer
- Redirects
- NGINX
- EC2
---

## 🧭 We replaced an NGINX server with AWS ALB for 70+ redirects — and cut costs by 70%

### Why we left EC2 + NGINX behind (and how much it saved us)

In one of my previous jobs, we needed to maintain over **70 domain redirects**. Our initial solution was simple: an **EC2 instance running NGINX** with a bunch of `301` and `302` rules.

And while that worked at first, things started to fall apart:

- Any new redirect meant SSH access and manual file editing
- Restarting NGINX came with downtime risks
- A single typo could break everything
- Most importantly: we were maintaining a full server just to handle redirects

---

### 💰 EC2 vs ALB: The Cost of Simplicity

{{< split 6 6 >}}

##### ❌ EC2 + NGINX

- ~$73/mo
- Manual file editing
- NGINX restarts = downtime
- Single point of failure

---

##### ✅ ALB + Terraform

- ~$22.50/mo
- No SSH ever
- Auto SSL (ACM)
- Fully scalable rules

{{< /split >}}


That’s a **~70% reduction**, with zero servers to maintain and full scalability.

---

## 🛠 The New Setup: ALB + Terraform + SSL + Logs

Once we made the switch, we wanted the entire solution to be automated, secure, and easy to maintain. Here’s what we built:

### 🗺️ Visual Overview: How the Flow Works

Sometimes it's easier to understand this type of infrastructure visually. Here's a high-level diagram that shows how user requests travel through Route 53, the ALB, and how redirect behavior is handled:

{{< img src="/images/posts/redirects-with-alb/redirect-flow.png" align="center" title="How Route 53 and ALB process incoming requests" alt="Diagram showing how Route 53 and ALB process incoming requests, including redirect behavior." >}}


This shows:
- What happens when someone accesses a random or known domain
- How Route 53 routes requests to the ALB
- The difference between traffic arriving on port 80 and port 443
- What the ALB does when no matching redirect rule is found (default 404)

### 🔧 Components Used

- **ALB (Application Load Balancer)**: Handles all HTTP/HTTPS requests
- **Redirect Listener Rules**: Define what gets redirected and where
- **Route 53**: Hosted Zones already managed all our domain DNS
- **AWS ACM**: For issuing and auto-renewing SSL certificates
- **Access Logs**: Enabled and pushed to S3 for auditing
- **Terraform**: Used to define everything as code
- **Modules**: We used Anton Babenko’s modules for [`alb`](https://github.com/terraform-aws-modules/terraform-aws-alb) and [`acm`](https://github.com/terraform-aws-modules/terraform-aws-acm)

---

### 🔐 Managing SSL Certificates with ACM

We used **ACM (AWS Certificate Manager)** to request certificates per domain, with auto-renewal enabled. Since we had all domains in Route 53, validation was done automatically via DNS — no manual setup needed.

Example:

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

### 🌐 ALB Listener Rules + Redirects
We implemented two listeners:

Port 80 (HTTP): Redirects everything to HTTPS

Port 443 (HTTPS): Processes redirect rules (up to 100 max), default action is 404
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

  http_tcp_listeners = [
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

### ✨ Why This Worked for Us
- ✅ No EC2 servers to maintain

- ✅ ~70% cost savings

- ✅ All redirects are version-controlled in Terraform

- ✅ SSL certificates managed automatically (with renewals) via ACM

- ✅ Access logs enabled for auditing

- ✅ Default rule returns 404 to avoid exposing internal details

- ✅ Port 80 cleanly redirects to HTTPS (443)

- ✅ Ready to integrate with WAF or CloudWatch in the future

{{< alert type="info" >}}
**Scaling Tip**: ALB supports up to 100 listener rules per listener. If your redirect needs grow beyond that, you can:
- Use multiple listeners (e.g., different ports or multiple ALBs)
- Consider moving to CloudFront Functions or Lambda@Edge for ultra-scale scenarios
- Group common redirects by wildcard domains or path patterns
{{< /alert >}}

Planning this from the start will save you from having to refactor your rules later.

### 💡 Lessons Learned

- Keep infrastructure as simple as the problem requires — NGINX was overkill for redirects.
- ALB rules are powerful, but don’t scale infinitely. Plan limits early.
- Terraform made experimentation and rollback safe and auditable.
- Relying on managed services like ACM for SSL removed 90% of the ops burden.
