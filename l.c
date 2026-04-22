chan requests = [0] of { byte }; // синхронный канал для запросов
chan responses = [0] of { byte }; // синхронный канал для ответов

proctype Client() {
byte req_id = 1;
byte resp;
printf("Client: starting\n");

// Отправляем первый запрос
printf("Client: sending request %d\n", req_id);
requests!req_id;

// ОШИБКА: пытаемся отправить второй запрос, не дождавшись ответа
req_id = 2;
printf("Client: sending request %d (WRONG! no wait)\n", req_id);
requests!req_id; // здесь клиент заблокируется, если сервер не готов
принять

// Теперь пытаемся получить ответы
responses?resp;
printf("Client: received response for request %d\n", resp);
responses?resp;
printf("Client: received response for request %d\n", resp);
printf("Client: finished\n");
}
proctype Server() {
byte req;
byte resp_id;
printf("Server: starting\n");
// Сервер работает в цикле: принять запрос -> обработать -> ответить
do
:: requests?req ->
printf("Server: received request %d\n", req);
// "Обработка" запроса
resp_id = req;
printf("Server: processing...\n");
// Отправка ответа
printf("Server: sending response for %d\n", resp_id);
responses!resp_id;
od
}
init {
run Client();
run Server();
}
