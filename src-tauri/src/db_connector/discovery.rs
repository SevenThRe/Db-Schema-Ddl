use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use super::{DbDiscoveredEndpoint, DbDiscoveryConfidence, DbDiscoverySource, DbDriver};

const CONNECT_TIMEOUT: Duration = Duration::from_millis(350);
const IO_TIMEOUT: Duration = Duration::from_millis(500);
const LOCALHOST_IPV4: &str = "127.0.0.1";

struct ProbeTarget {
  driver: DbDriver,
  host: &'static str,
  port: u16,
  label: &'static str,
  database_hint: &'static str,
  username_hint: &'static str,
  default_schema_hint: Option<&'static str>,
}

enum ProbeResult {
  Verified {
    source: DbDiscoverySource,
    confidence: DbDiscoveryConfidence,
    detail: String,
  },
  Reachable {
    detail: String,
  },
}

pub fn discover_local_databases() -> Vec<DbDiscoveredEndpoint> {
  let mut discovered = Vec::new();

  for target in probe_targets() {
    if let Some(candidate) = probe_target(target) {
      discovered.push(candidate);
    }
  }

  discovered.sort_by_key(|candidate| {
    let confidence_rank = match candidate.confidence {
      DbDiscoveryConfidence::High => 0_u8,
      DbDiscoveryConfidence::Medium => 1_u8,
      DbDiscoveryConfidence::Low => 2_u8,
    };
    let driver_rank = match candidate.driver {
      DbDriver::Postgres => 0_u8,
      DbDriver::Mysql => 1_u8,
    };
    (confidence_rank, driver_rank, candidate.port)
  });

  discovered
}

fn probe_targets() -> Vec<ProbeTarget> {
  vec![
    ProbeTarget {
      driver: DbDriver::Postgres,
      host: LOCALHOST_IPV4,
      port: 5432,
      label: "Local PostgreSQL",
      database_hint: "postgres",
      username_hint: "postgres",
      default_schema_hint: Some("public"),
    },
    ProbeTarget {
      driver: DbDriver::Mysql,
      host: LOCALHOST_IPV4,
      port: 3306,
      label: "Local MySQL",
      database_hint: "mysql",
      username_hint: "root",
      default_schema_hint: None,
    },
  ]
}

fn probe_target(target: ProbeTarget) -> Option<DbDiscoveredEndpoint> {
  let result = match &target.driver {
    DbDriver::Mysql => probe_mysql(target.host, target.port),
    DbDriver::Postgres => probe_postgres(target.host, target.port),
  }
  .ok()?;

  let (source, confidence, detail) = match result {
    ProbeResult::Verified {
      source,
      confidence,
      detail,
    } => (source, confidence, detail),
    ProbeResult::Reachable { detail } => (
      DbDiscoverySource::TcpPortScan,
      DbDiscoveryConfidence::Medium,
      detail,
    ),
  };

  Some(DbDiscoveredEndpoint {
    id: format!(
      "{}-{}-{}",
      match target.driver {
        DbDriver::Mysql => "mysql",
        DbDriver::Postgres => "postgres",
      },
      target.host.replace('.', "-"),
      target.port
    ),
    driver: target.driver,
    host: target.host.to_string(),
    port: target.port,
    source,
    confidence,
    label: target.label.to_string(),
    detail,
    database_hint: Some(target.database_hint.to_string()),
    username_hint: Some(target.username_hint.to_string()),
    default_schema_hint: target.default_schema_hint.map(str::to_string),
  })
}

fn probe_mysql(host: &str, port: u16) -> Result<ProbeResult, String> {
  let mut stream = connect(host, port)?;
  let mut buffer = [0_u8; 64];
  let bytes_read = match stream.read(&mut buffer) {
    Ok(bytes) => bytes,
    Err(err) if matches!(err.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {
      return Ok(ProbeResult::Reachable {
        detail: "TCP port responded on the MySQL default endpoint, but the protocol handshake timed out."
          .to_string(),
      });
    }
    Err(err) => return Err(err.to_string()),
  };
  if bytes_read == 0 {
    return Ok(ProbeResult::Reachable {
      detail: "TCP port responded on the MySQL default endpoint, but no handshake bytes were returned before timeout."
        .to_string(),
    });
  }

  if bytes_read >= 5 && buffer[4] == 0x0a {
    return Ok(ProbeResult::Verified {
      source: DbDiscoverySource::MysqlHandshake,
      confidence: DbDiscoveryConfidence::High,
      detail: "MySQL protocol handshake detected on the default localhost port.".to_string(),
    });
  }

  Ok(ProbeResult::Reachable {
    detail: "TCP port responded on the MySQL default endpoint, but the handshake was not confidently identified."
      .to_string(),
  })
}

fn probe_postgres(host: &str, port: u16) -> Result<ProbeResult, String> {
  let mut stream = connect(host, port)?;
  match stream.write_all(&[0, 0, 0, 8, 4, 210, 22, 47]) {
    Ok(()) => {}
    Err(err) if matches!(err.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {
      return Ok(ProbeResult::Reachable {
        detail: "TCP port responded on the PostgreSQL default endpoint, but the SSL probe write timed out."
          .to_string(),
      });
    }
    Err(err) => return Err(err.to_string()),
  }

  let mut response = [0_u8; 1];
  let bytes_read = match stream.read(&mut response) {
    Ok(bytes) => bytes,
    Err(err) if matches!(err.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {
      return Ok(ProbeResult::Reachable {
        detail: "TCP port responded on the PostgreSQL default endpoint, but the protocol response timed out."
          .to_string(),
      });
    }
    Err(err) => return Err(err.to_string()),
  };
  if bytes_read == 0 {
    return Ok(ProbeResult::Reachable {
      detail: "TCP port responded on the PostgreSQL default endpoint, but no protocol response was returned before timeout."
        .to_string(),
    });
  }

  if matches!(response[0], b'S' | b'N' | b'E') {
    return Ok(ProbeResult::Verified {
      source: DbDiscoverySource::PostgresSslProbe,
      confidence: DbDiscoveryConfidence::High,
      detail: "PostgreSQL SSL probe responded on the default localhost port.".to_string(),
    });
  }

  Ok(ProbeResult::Reachable {
    detail:
      "TCP port responded on the PostgreSQL default endpoint, but the protocol response was not confidently identified."
        .to_string(),
  })
}

fn connect(host: &str, port: u16) -> Result<TcpStream, String> {
  let address = SocketAddr::from(([127, 0, 0, 1], port));
  if host != LOCALHOST_IPV4 {
    return Err("Only localhost IPv4 probing is supported in this wave.".to_string());
  }

  let stream = TcpStream::connect_timeout(&address, CONNECT_TIMEOUT).map_err(|err| err.to_string())?;
  stream
    .set_read_timeout(Some(IO_TIMEOUT))
    .map_err(|err| err.to_string())?;
  stream
    .set_write_timeout(Some(IO_TIMEOUT))
    .map_err(|err| err.to_string())?;
  Ok(stream)
}
