# Local stand-in for the shared hosting: Apache with PHP, nothing else.
# Keep the PHP version equal to the one selected on the host.
FROM php:8.4-apache

# unzip is what Composer uses to unpack the libraries it downloads. The zip
# extension builds the archive of "download everything" (songs): the host has
# it, and it needs libzip here.
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip libzip-dev \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install pdo_mysql zip \
    && a2enmod rewrite headers \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    # The storage folder belongs to the web server, as on the host. The
    # volumes mounted there (docker-compose.yml) take this owner.
    && mkdir -p /var/www/storage /var/www/import \
    && chown www-data:www-data /var/www/storage /var/www/import

# Composer installs the PHP libraries. It is a development tool: the host
# never runs it, it receives the vendor/ folder already filled.
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY apache.conf /etc/apache2/sites-available/000-default.conf
