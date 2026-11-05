resource "aws_s3_bucket" "frontend" {

  bucket_prefix = "${var.project}-ui-"
  force_destroy = false

}
resource "aws_s3_bucket_public_access_block" "frontend" {


  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

}
resource "aws_cloudfront_origin_access_control" "frontend" {


  name                              = "${var.project}-s3-oac"
  description                       = "OAC for SDV static frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"

}
resource "aws_cloudfront_distribution" "frontend" {


  enabled             = true
  is_ipv6_enabled     = true
  comment             = "SDV academic simulation"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  origin {


    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "static"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id

  }
  origin {


    domain_name = aws_lb.main.dns_name
    origin_id   = "graphql-alb"
    custom_origin_config {


      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]

    }


  }
  default_cache_behavior {


    target_origin_id       = "static"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"

  }
  ordered_cache_behavior {


    path_pattern             = "/auth/*"
    target_origin_id         = "graphql-alb"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    viewer_protocol_policy   = "https-only"
    cache_policy_id          = "4135ea2d-6df8-44a4-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

  }
  ordered_cache_behavior {


    path_pattern             = "/graphql"
    target_origin_id         = "graphql-alb"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    viewer_protocol_policy   = "https-only"
    cache_policy_id          = "4135ea2d-6df8-44a4-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

  }
  ordered_cache_behavior {


    path_pattern             = "/subscriptions"
    target_origin_id         = "graphql-alb"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    viewer_protocol_policy   = "https-only"
    cache_policy_id          = "4135ea2d-6df8-44a4-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

  }
  custom_error_response {

    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0

  }
  custom_error_response {

    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0

  }
  restrictions {

    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {

    cloudfront_default_certificate = true
  }

}
resource "aws_s3_bucket_policy" "frontend" {


  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Sid = "AllowCloudFrontOnly", Effect = "Allow", Principal = {
        Service = "cloudfront.amazonaws.com"
        }, Action = "s3:GetObject", Resource = "${aws_s3_bucket.frontend.arn}/*", Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })

}
