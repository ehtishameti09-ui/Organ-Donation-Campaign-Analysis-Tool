# Laravel 11 / PHP 8.2 on Apache, sized for a free-tier container host.
#
# Two-stage: Composer resolves dependencies in a builder that carries the full
# toolchain, and only the resulting vendor/ is copied into the runtime image. That
# keeps git, unzip and the Composer cache out of the image that actually serves
# traffic - which matters on a 512 MB free instance.

# ---------------------------------------------------------------- build stage
FROM composer:2 AS vendor

WORKDIR /app

# Only the manifests first, so this layer is reused whenever application code
# changes but dependencies do not - the slowest step is then usually cached.
COPY composer.json composer.lock ./

# --no-scripts because artisan is not here yet; package discovery runs at runtime.
RUN composer install \
      --no-dev \
      --no-interaction \
      --no-scripts \
      --prefer-dist \
      --optimize-autoloader

# -------------------------------------------------------------- runtime stage
FROM php:8.2-apache

# libzip/libpng/etc are the headers the PHP extensions below compile against.
# Removed from the final layer in the same RUN so they do not persist in the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libzip-dev \
      libpng-dev \
      libjpeg62-turbo-dev \
      libfreetype6-dev \
      libonig-dev \
      default-mysql-client \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
      pdo_mysql \
      mysqli \
      mbstring \
      zip \
      gd \
      bcmath \
      opcache \
    && apt-get purge -y --auto-remove \
      libzip-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev libonig-dev \
    && rm -rf /var/lib/apt/lists/*

# OPcache. The first request after a cold start compiles the whole framework;
# without this every request pays that cost. validate_timestamps=0 is safe because
# the code never changes inside a running container - a deploy builds a new image.
RUN { \
      echo 'opcache.enable=1'; \
      echo 'opcache.memory_consumption=128'; \
      echo 'opcache.interned_strings_buffer=16'; \
      echo 'opcache.max_accelerated_files=20000'; \
      echo 'opcache.validate_timestamps=0'; \
    } > /usr/local/etc/php/conf.d/opcache.ini

# Uploaded documents (CNICs, medical certificates) go through PHP's upload limits,
# which default to 2 MB - smaller than a phone photo.
RUN { \
      echo 'upload_max_filesize=12M'; \
      echo 'post_max_size=16M'; \
      echo 'memory_limit=256M'; \
    } > /usr/local/etc/php/conf.d/uploads.ini

RUN a2enmod rewrite headers

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY . .

# Laravel serves from public/, not the project root. Without this the whole
# source tree - including .env - would be web-reachable.
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
      /etc/apache2/sites-available/*.conf \
      /etc/apache2/apache2.conf \
      /etc/apache2/conf-available/*.conf

# AllowOverride so public/.htaccess (Laravel's front-controller rewrites) applies.
RUN printf '%s\n' \
      '<Directory /var/www/html/public>' \
      '    AllowOverride All' \
      '    Require all granted' \
      '</Directory>' \
      '# Health checks and uptime pingers should not fill the log.' \
      'SetEnvIf Request_URI "^/api/health$" dontlog' \
      'CustomLog /dev/stdout combined env=!dontlog' \
      > /etc/apache2/conf-available/laravel.conf \
    && a2enconf laravel

RUN chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

EXPOSE 10000

ENTRYPOINT ["/usr/local/bin/entrypoint"]
