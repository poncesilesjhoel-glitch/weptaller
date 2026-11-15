# Imagen para Render (o cualquier hosting con Docker): PHP 8.3 + Apache
FROM php:8.3-apache

# Módulos que usa .htaccess y permitir .htaccess en el sitio
RUN a2enmod rewrite headers expires deflate \
 && sed -ri 's#AllowOverride None#AllowOverride All#g' /etc/apache2/apache2.conf

# Render indica el puerto en la variable PORT
ENV PORT=10000
RUN sed -ri 's/Listen 80/Listen ${PORT}/' /etc/apache2/ports.conf \
 && sed -ri 's/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/' /etc/apache2/sites-available/000-default.conf

COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html/api/datos

EXPOSE 10000
