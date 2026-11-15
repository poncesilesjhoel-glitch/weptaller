# Imagen para Render (o cualquier hosting con Docker): PHP 8.3 + Apache + PostgreSQL
FROM php:8.3-apache

# Extensión para PostgreSQL, módulos que usa .htaccess y permitir .htaccess
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev \
 && docker-php-ext-install pdo_pgsql \
 && rm -rf /var/lib/apt/lists/* \
 && a2enmod rewrite headers expires deflate \
 && sed -ri 's#AllowOverride None#AllowOverride All#g' /etc/apache2/apache2.conf

# Render indica el puerto en la variable PORT
ENV PORT=10000
RUN sed -ri 's/Listen 80/Listen ${PORT}/' /etc/apache2/ports.conf \
 && sed -ri 's/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/' /etc/apache2/sites-available/000-default.conf

COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/api/datos

EXPOSE 10000
