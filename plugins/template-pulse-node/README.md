# Template Pulse Node library

Backend query validation, authorization, aggregation and `HistoryClient`.
The client discovers the Scaffolder backend and calls its Template Pulse
module over HTTP, issuing a fresh plugin request token on behalf of the user
for each request. This library has no backend feature to register.
