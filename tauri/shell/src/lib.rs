// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! The Tauri desktop shell's decision layer.
//!
//! Every module here answers one question the shell has to answer, and none
//! of them draws, opens or talks to anything: those live in `src-tauri/`,
//! which is the only crate in this tree that knows Tauri exists.
//!
//! | Module           | Answers                                     |
//! | ---------------- | ------------------------------------------- |
//! | [`config`]       | where the app points itself, and its names  |
//! | [`output`]       | where a diagnostic line goes                |
//! | [`webroot`]      | which file one request path is             |
//! | [`window_state`] | where the window opens                      |
//! | [`display`]      | whether there is anywhere to put a window   |
//!
//! Tests for all of it live in `tests/` as their own files, which is the
//! second reason this is a library crate rather than a module of the binary:
//! a Rust integration test can only reach a crate's public API.

pub mod config;
pub mod display;
pub mod output;
pub mod webroot;
pub mod window_state;
