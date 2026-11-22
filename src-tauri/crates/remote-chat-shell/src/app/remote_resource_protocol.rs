use std::collections::BTreeMap;
use std::sync::Arc;

use tauri::Manager;
use tauri::http::{
    HeaderMap, Request, Response, StatusCode,
    header::{
        ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
        ACCESS_CONTROL_EXPOSE_HEADERS, CONTENT_TYPE,
    },
};
use tt_contracts::client_asset_paths::THIRD_PARTY_EXTENSION_ROUTE_PREFIX;
use tt_contracts::remote_control::RemoteControlResourceRequest;

use crate::app::composition::ShellServices;

const RESOURCE_REQUEST_HEADERS: [&str; 4] =
    ["if-modified-since", "if-none-match", "if-range", "range"];

pub(crate) async fn handle(
    app_handle: &tauri::AppHandle,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let Some((session_id, path)) = parse_request_path(&request) else {
        return error_response(StatusCode::NOT_FOUND, "Remote extension resource not found");
    };
    if !matches!(request.method().as_str(), "GET" | "HEAD" | "OPTIONS") {
        return error_response(
            StatusCode::METHOD_NOT_ALLOWED,
            "Remote extension resources are read-only",
        );
    }

    let Some(services) = app_handle
        .try_state::<Arc<ShellServices>>()
        .map(|state| state.inner().clone())
    else {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "Remote Control client is not ready",
        );
    };
    let resource_request = RemoteControlResourceRequest {
        session_id: session_id.clone(),
        method: request.method().as_str().to_string(),
        path,
        headers: forwardable_headers(request.headers()),
    };

    match services
        .remote_control_client
        .get_extension_resource(&session_id, resource_request)
        .await
    {
        Ok(resource) => {
            let status = StatusCode::from_u16(resource.status).unwrap_or(StatusCode::BAD_GATEWAY);
            let mut builder = Response::builder().status(status);
            for (name, value) in resource.headers {
                builder = builder.header(name, value);
            }
            builder
                .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
                .header(
                    ACCESS_CONTROL_ALLOW_HEADERS,
                    "If-Modified-Since, If-None-Match, If-Range, Range",
                )
                .header(
                    ACCESS_CONTROL_EXPOSE_HEADERS,
                    "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
                )
                .body(resource.body)
                .unwrap_or_else(|_| {
                    error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to build remote extension resource response",
                    )
                })
        }
        Err(error) => {
            tracing::warn!(%error, "Remote extension resource request failed");
            error_response(StatusCode::BAD_GATEWAY, &error.to_string())
        }
    }
}

fn parse_request_path(request: &Request<Vec<u8>>) -> Option<(String, String)> {
    let authority = request.uri().authority()?;
    if authority.port().is_some() {
        return None;
    }

    let session_id = authority.host().strip_suffix(".localhost")?;
    if session_id.is_empty() || session_id.contains('.') {
        return None;
    }
    let resource_path = request.uri().path().to_string();
    if !resource_path.starts_with(THIRD_PARTY_EXTENSION_ROUTE_PREFIX) {
        return None;
    }
    let path = match request.uri().query() {
        Some(query) if !query.is_empty() => format!("{resource_path}?{query}"),
        _ => resource_path,
    };
    Some((session_id.to_string(), path))
}

fn forwardable_headers(headers: &HeaderMap) -> BTreeMap<String, String> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            let name = name.as_str();
            if !RESOURCE_REQUEST_HEADERS.contains(&name) {
                return None;
            }
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect()
}

fn error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(message.as_bytes().to_vec())
        .expect("controlled remote-resource error response")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(uri: &str) -> Request<Vec<u8>> {
        Request::builder()
            .uri(uri)
            .body(Vec::new())
            .expect("protocol request")
    }

    #[test]
    fn remote_protocol_accepts_only_session_scoped_third_party_resource_urls() {
        assert_eq!(
            parse_request_path(&request(
                "tt-remote://session-1.localhost/scripts/extensions/third-party/example/manifest.json?ttCompat=layer"
            )),
            Some((
                "session-1".to_string(),
                "/scripts/extensions/third-party/example/manifest.json?ttCompat=layer".to_string(),
            ))
        );
        assert!(
            parse_request_path(&request(
                "tt-remote://session-1.localhost/backgrounds/private.png"
            ))
            .is_none()
        );
        assert!(
            parse_request_path(&request(
                "tt-remote://other-host/scripts/extensions/third-party/example/manifest.json"
            ))
            .is_none()
        );
    }
}
