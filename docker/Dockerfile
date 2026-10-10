# Local stand-in for the shared hosting: Apache with PHP, nothing else.
# Keep the PHP version equal to the one selected on the host.
FROM php:8.4-apache

# unzip is what Composer uses to unpack the libraries it downloads.
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install pdo_mysql \
    && a2enmod rewrite \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# Composer installs the PHP libraries. It is a development tool: the host
# never runs it, it receives the vendor/ folder already filled.
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY apache.conf /etc/apache2/sites-available/000-default.conf
