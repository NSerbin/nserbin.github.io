---
title: "NGINX Out, ALB In - 70% Cheaper Redirects with Zero Servers"
date: 2025-07-14T22:00:00+01:00
hero: /images/posts/nginx-to-alb.webp
description: Learn how we replaced EC2 + NGINX with AWS ALB and Terraform to handle 70+ serverless redirects — with zero servers, zero downtime, and 70% lower costs.
theme: Toha
menu:
  sidebar:
    name: Migrating from NGINX to ALB
    identifier: from-nginx-to-alb
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

Before jumping into the why and how, here's what we achieved:

- ✅ Replaced a single point of failure with AWS-native components

- 💸 Reduced monthly costs by 70%

- 🧑‍💻 No more SSH, servers, or NGINX restarts

- 🔐 Fully managed SSL with ACM

- 🛠️ Everything codified and versioned via Terraform

{{< alert type="success" >}}
All of this — without a single EC2 server or NGINX config file.
{{< /alert >}}

{{< vs 3 >}}

## Why we left EC2 + NGINX behind (and how much it saved us)
{{< vs 1 >}}
We had a simple goal: redirect traffic for over **70 different domains**.  
At first, we solved it with what we knew — an **EC2 instance running NGINX** with hardcoded `301` and `302` rules. It worked… until it didn’t.

{{< vs 3 >}}

What started as a quick fix became an operational headache:

- Any new redirect meant SSH access and manual file editing  
- Restarting NGINX came with downtime risks  
- A single typo could break everything  
- Most importantly: we were maintaining a full server just to handle redirects

{{< vs 2 >}}

Eventually, we asked ourselves: _isn’t this just a glorified spreadsheet with SSL and uptime issues?_  
That question led us to redesign the whole setup using **ALB, Terraform, ACM**, and nothing else.

And it worked — spectacularly.
{{< vs 4 >}}

## 💰 EC2 vs ALB: The Cost of Simplicity
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
<td><strong>Cost</strong></td>
<td>~$73/mo</td>
<td>~$22.50/mo</td>
</tr>
<tr>
<td><strong>Access</strong></td>
<td>SSH/SSM required</td>
<td>No SSH/SSM ever</td>
</tr>
<tr>
<td><strong>SSL</strong></td>
<td>Manual setup</td>
<td>Auto SSL (ACM)</td>
</tr>
<tr>
<td><strong>Maintenance</strong></td>
<td>Manual file editing</td>
<td>Fully versioned in Terraform</td>
</tr>
<tr>
<td><strong>Scalability</strong></td>
<td>Single point of failure</td>
<td>Fully scalable rules</td>
</tr>
<tr>
<td><strong>Downtime</strong></td>
<td>NGINX restarts cause downtime</td>
<td>Zero downtime on rule changes</td>
</tr>
</tbody>
</table>

</div>


{{< vs 2 >}}

That’s a **~70% reduction**, with zero servers to maintain and full scalability.

{{< vs 4 >}}

## 🛠 The New Setup: ALB + Terraform + SSL + Logs

Once we made the switch, we wanted the entire solution to be automated, secure, and easy to maintain. Here’s what we built:

{{< vs 4 >}}

### 📊 Visual Overview: How the Flow Works

Sometimes it's easier to understand this type of infrastructure visually. Here's a high-level diagram that shows how user requests travel through Route 53, the ALB, and how redirect behavior is handled:

{{< vs 2 >}}

{{< img src="/posts/aws/aws-networking/images/diagram-redirect-alb.png" align="center" title="How Route 53 and ALB process incoming requests" >}}

{{< vs 2 >}}

This shows:  
- What happens when someone accesses a random or known domain  
- How Route 53 routes requests to the ALB  
- The difference between traffic arriving on port 80 and port 443  
- What the ALB does when no matching redirect rule is found (default 404)

{{< vs 4 >}}

### 🔧 Components Used

- **ALB (Application Load Balancer)**: Handles all HTTP/HTTPS requests  
- **Redirect Listener Rules**: Define what gets redirected and where  
- **Route 53**: Hosted Zones already managed all our domain DNS  
- **AWS ACM**: For issuing and auto-renewing SSL certificates  
- **Access Logs**: Enabled and pushed to S3 for auditing  
- **Terraform**: Used to define everything as code  
- **Modules**: We used Anton Babenko’s modules for [`alb`](https://github.com/terraform-aws-modules/terraform-aws-alb) and [`acm`](https://github.com/terraform-aws-modules/terraform-aws-acm)

{{< vs 4 >}}

### 🔐 Managing SSL Certificates with ACM

We used **ACM (AWS Certificate Manager)** to request certificates per domain, with auto-renewal enabled. Since we had all domains in Route 53, validation was done automatically via DNS — no manual setup needed.

{{< vs 2 >}}

Code:

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
### 🌐 ALB Listener Rules + Redirects
We implemented two listeners:

- Port `80` (HTTP): Redirects everything to HTTPS

- Port `443` (HTTPS): Processes redirect rules (up to 100 max), default action is `404`
{{< vs 2 >}}

Code:
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

### ✨ Why This Worked for Us
{{< vs 2 >}}
✅ Fully serverless — no EC2 to maintain

✅ ~70% cost savings

✅ All redirects are version-controlled in Terraform

✅ SSL certificates managed automatically (with renewals) via ACM

✅ Access logs enabled for auditing

✅ Default rule returns 404 to avoid exposing internal details

✅ Port 80 cleanly redirects to HTTPS (443)

✅ Ready to integrate with WAF or CloudWatch in the future

✅ Everything is Infrastructure-as-Code, ready for CI/CD pipelines


{{< vs 3 >}}

### ❌ What We Didn't Use (And Why)
{{< vs 2 >}}
- **Lambda@Edge** – great for complex logic at scale, but overkill for simple 301s.  
- **CloudFront Functions** – less Terraform support, more limits.  
- **S3 Static Hosting** – no built-in SSL unless fronted by CloudFront.  

_In the end, simplicity won. ALB covered 100% of our use case — no Lambda, no CloudFront needed._


{{< vs 3 >}}
## 📌 Scaling Tip 
> AWS ALB supports up to **100 listener rules per listener**.  
>  
> If you need more, consider:  
> • 🧩 Use multiple listeners (e.g., different ports or multiple ALBs)  
> • 🚀 Move to CloudFront Functions or Lambda@Edge for large-scale redirects  
> • 🗂️ Group redirects using wildcard domains or path patterns  

{{< vs 1 >}}  
_Plan your redirect strategy early to avoid scaling bottlenecks later._

{{< vs 4 >}}

## 💡 Lessons Learned

- Keep infrastructure as simple as the problem requires — NGINX was overkill for redirects.  
- ALB rules are powerful, but don’t scale infinitely. Plan limits early.  
- Terraform made experimentation and rollback safe and auditable.  
- Relying on managed services like ACM for SSL removed 90% of the ops burden.

_In short, we turned a fragile EC2 setup into a robust serverless system — saving money, effort, and future headaches._

{{< vs 4 >}}

## 🙋‍♂️ Need Help With This?

Considering a similar migration or want to simplify your redirect setup?

We've migrated this same pattern across multiple AWS accounts — and the ops team never looked back.

💬 [Let’s chat on LinkedIn](https://linkedin.com/in/NSerbin) — happy to help or exchange ideas.
{{< vs 4 >}}