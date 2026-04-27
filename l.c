#include <zmq.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// Клиент ZeroMQ.

int main() {
    // Получаем PID клиента, чтобы показать, какой клиент отправил запрос.
    pid_t pid = getpid();

    // Создаём контекст ZeroMQ
    void *context = zmq_ctx_new();

    if (context == NULL) {
        perror("zmq_ctx_new");
        exit(EXIT_FAILURE);
    }

    // Создаём сокет типа REQ. Он будет отправлять запрос серверу и ждать ответ
    void *requester = zmq_socket(context, ZMQ_REQ);

    if (requester == NULL) {
        perror("zmq_socket");
        zmq_ctx_destroy(context);
        exit(EXIT_FAILURE);
    }

    // Подключаемся к серверу
    int rc = zmq_connect(requester, "tcp://localhost:5555");

    if (rc != 0) {
        perror("zmq_connect");
        zmq_close(requester);
        zmq_ctx_destroy(context);
        exit(EXIT_FAILURE);
    }
    printf("ZeroMQ клиент запущен. PID клиента: %d\n", pid);
    printf("Подключение к серверу выполнено.\n");

    // Формируем запрос серверу
    char request[256];

    snprintf(
        request,
        sizeof(request),
        "Привет от ZeroMQ-клиента PID=%d",
        pid
    );

    // Отправляем запрос серверу
    if (zmq_send(requester, request, strlen(request) + 1, 0) == -1) {
        perror("zmq_send");
        zmq_close(requester);
        zmq_ctx_destroy(context);
        exit(EXIT_FAILURE);
    }
    printf("Запрос отправлен серверу.\n");
    printf("Ожидание ответа...\n");

    // Получаем ответ от сервера
    char response[256];

    memset(response, 0, sizeof(response));

    int bytes = zmq_recv(requester, response, sizeof(response) - 1, 0);

    if (bytes == -1) {
        perror("zmq_recv");
        zmq_close(requester);
        zmq_ctx_destroy(context);
        exit(EXIT_FAILURE);
    }
    printf("Ответ получен от сервера:\n");
    printf("%s\n", response);

    // Закрываем сокет и уничтожаем контекст
    zmq_close(requester);
    zmq_ctx_destroy(context);

    printf("Клиент завершил работу.\n");
    return 0;
}