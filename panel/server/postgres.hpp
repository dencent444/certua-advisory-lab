#pragma once

#include <dlfcn.h>

#include <cstdlib>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// Load libpq at runtime; the build needs no PostgreSQL headers or linker dependency.
// Queries still require PANEL_DATABASE_URL and libpq.so.5 on the running host.
class Postgres {
  using Connect = void* (*)(const char*);
  using Status = int (*)(const void*);
  using Error = char* (*)(const void*);
  using Finish = void (*)(void*);
  using ExecParams = void* (*)(void*, const char*, int, const unsigned*,
                               const char* const*, const int*, const int*, int);
  using ResultStatus = int (*)(const void*);
  using Tuples = int (*)(const void*);
  using Fields = int (*)(const void*);
  using Value = char* (*)(const void*, int, int);
  using Clear = void (*)(void*);

  void* library_ = nullptr;
  std::string connection_string_;
  Connect connect_ = nullptr;
  Status status_ = nullptr;
  Error error_ = nullptr;
  Finish finish_ = nullptr;
  ExecParams exec_params_ = nullptr;
  ResultStatus result_status_ = nullptr;
  Tuples tuples_ = nullptr;
  Fields fields_ = nullptr;
  Value value_ = nullptr;
  Clear clear_ = nullptr;

  template <typename Function>
  Function symbol(const char* name) {
    auto* address = dlsym(library_, name);
    if (!address) throw std::runtime_error(std::string("missing libpq symbol: ") + name);
    return reinterpret_cast<Function>(address);
  }

 public:
  Postgres() {
    const char* url = std::getenv("PANEL_DATABASE_URL");
    if (!url || !*url) throw std::runtime_error("PANEL_DATABASE_URL is required");
    connection_string_ = url;
    library_ = dlopen("libpq.so.5", RTLD_NOW | RTLD_LOCAL);
    if (!library_) throw std::runtime_error("libpq.so.5 is required");
    connect_ = symbol<Connect>("PQconnectdb");
    status_ = symbol<Status>("PQstatus");
    error_ = symbol<Error>("PQerrorMessage");
    finish_ = symbol<Finish>("PQfinish");
    exec_params_ = symbol<ExecParams>("PQexecParams");
    result_status_ = symbol<ResultStatus>("PQresultStatus");
    tuples_ = symbol<Tuples>("PQntuples");
    fields_ = symbol<Fields>("PQnfields");
    value_ = symbol<Value>("PQgetvalue");
    clear_ = symbol<Clear>("PQclear");
  }

  ~Postgres() {
    if (library_) dlclose(library_);
  }

  Postgres(const Postgres&) = delete;
  Postgres& operator=(const Postgres&) = delete;

  // Open a connection per call and bind all supplied values as SQL parameters.
  std::vector<std::vector<std::string>> query(
      const std::string& sql, const std::vector<std::string>& parameters = {}) const {
    void* connection = connect_(connection_string_.c_str());
    if (!connection) throw std::runtime_error("PostgreSQL connection allocation failed");
    if (status_(connection) != 0) {
      const std::string message = error_(connection);
      finish_(connection);
      throw std::runtime_error("PostgreSQL connection failed: " + message);
    }

    std::vector<const char*> values;
    values.reserve(parameters.size());
    for (const auto& parameter : parameters) values.push_back(parameter.c_str());
    void* result = exec_params_(connection, sql.c_str(), static_cast<int>(values.size()),
                                nullptr, values.data(), nullptr, nullptr, 0);
    if (!result || (result_status_(result) != 1 && result_status_(result) != 2)) {
      const std::string message = error_(connection);
      if (result) clear_(result);
      finish_(connection);
      throw std::runtime_error("PostgreSQL query failed: " + message);
    }

    std::vector<std::vector<std::string>> rows;
    for (int row = 0; row < tuples_(result); ++row) {
      std::vector<std::string> columns;
      for (int column = 0; column < fields_(result); ++column) {
        columns.emplace_back(value_(result, row, column));
      }
      rows.push_back(std::move(columns));
    }
    clear_(result);
    finish_(connection);
    return rows;
  }
};
