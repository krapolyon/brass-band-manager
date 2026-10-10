# Local stand-in for the shared hosting: Apache with PHP, nothing else.
# Keep the PHP version equal to the one selected on the host.
FROM php:8.4-apache

RUN docker-php-ext-install pdo_mysql \
    && a2enmod rewrite \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY apache.conf /etc/apache2/sites-available/000-default.conf
