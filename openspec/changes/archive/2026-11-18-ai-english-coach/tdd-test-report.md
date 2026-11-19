---
generated_at: 2026-11-18T08:24:30Z
change: ai-english-coach
test_command: python3 -m pytest tests/ -q
runner: pytest
runner_version: 9.2.0
codebase: app/backend
---

# TDD Test Report: ai-english-coach

Total test cases: 90

## Passed Tests

| task_id | test_file | test_case | duration_ms | sha256_of_test_file |
|---|---|---|---|---|
| 5.2 | tests/test_assessment_engine.py | test_classify_deaf | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_classify_unknown | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_classify_automatic_fast | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_classify_recognized_slow | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_starts_at_middle_level | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_correct_moves_harder | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_wrong_moves_easier | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_no_repeat_questions | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_stops_at_max_questions | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_targeted_after_repeated_failures | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_ability_level_all_correct | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_ability_level_all_wrong_is_min | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_weak_tags_sorted | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_summary_shape | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_empty_items_raises | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_submit_unknown_item_raises | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_apply_probe_to_profile_marks_deaf_and_hearing | 1 | 887acc35dacf |
| 5.2 | tests/test_assessment_engine.py | test_apply_probe_writes_hearing_for_weak_tag | 1 | 887acc35dacf |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_short_answer_flags_avoidance | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_hesitation_marker_flagged | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_rich_answer_no_avoidance | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_live_signals_accumulate_in_session | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_review_includes_live_signals | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_target_difficulty_default_mid | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_target_difficulty_low_when_many_deaf | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_target_difficulty_from_feedback_low | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_target_difficulty_from_feedback_high | 1 | f1302cb35598 |
| 7.2/8.2 | tests/test_live_and_calibration.py | test_seed_items_respects_difficulty | 1 | f1302cb35598 |
| 3.1 | tests/test_llm_client.py | test_endpoint_v1_suffix | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_endpoint_bare_host | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_endpoint_already_full | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_endpoint_compatible_mode_path | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_endpoint_empty_raises | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_headers_with_key | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_headers_without_key | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_build_payload | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_parse_sse_content | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_parse_sse_done | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_parse_sse_ignores_blank_and_non_data | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_parse_sse_bad_json | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_parse_sse_no_content | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_extract_message_content | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_extract_message_content_empty | 1 | 98b7034094ae |
| 3.1 | tests/test_llm_client.py | test_client_ensure_ready_raises_without_config | 1 | 98b7034094ae |
| 2.1 | tests/test_models.py | test_empty_profile_has_all_dimensions | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_seen_known_but_not_heard_is_deaf_vocab | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_not_known_is_unknown | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_heard_fast_is_automatic | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_heard_slow_is_recognized_not_automatic | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_vocab_state_counts | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_domains_are_isolated | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_hearing_written_to_domain_and_global | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_weakest_hearing_sorted | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_scenario_success_records_venue | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_failed_scenario_does_not_count_venue | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_skill_graduation_requires_three_distinct_venues | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_same_venue_twice_does_not_double_count | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_graduation_across_domains_counts_venues | 1 | 0bc9dc8812e7 |
| 2.1 | tests/test_models.py | test_avoidance_and_errors_recorded | 1 | 0bc9dc8812e7 |
| 7.1/8.1/9.1 | tests/test_services.py | test_seed_cards_loaded | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_scenario_session_start | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_offline_actor_reply_advances_beats | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_review_local_marks_success_with_enough_turns | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_apply_review_records_scenario | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_apply_review_avoidance_recorded | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_seed_items_fallback | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_normalize_items_clamps_difficulty | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_generate_items_without_llm_uses_seed | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_local_report_has_sections_and_evidence | 1 | d2f696f504d5 |
| 7.1/8.1/9.1 | tests/test_services.py | test_build_report_without_llm | 1 | d2f696f504d5 |
| 2.2 | tests/test_storage.py | test_load_or_create_new_profile | 1 | e2588a6b9b79 |
| 2.2 | tests/test_storage.py | test_save_then_get_roundtrip | 1 | e2588a6b9b79 |
| 2.2 | tests/test_storage.py | test_get_missing_returns_none | 1 | e2588a6b9b79 |
| 2.2 | tests/test_storage.py | test_load_or_create_idempotent | 1 | e2588a6b9b79 |
| 2.2 | tests/test_storage.py | test_delete_user | 1 | e2588a6b9b79 |
| 2.2 | tests/test_storage.py | test_list_users | 1 | e2588a6b9b79 |
| 2.2 | tests/test_storage.py | test_persist_to_file | 1 | e2588a6b9b79 |
| 2.2 | tests/test_storage.py | test_unicode_preserved | 1 | e2588a6b9b79 |
| 6.4 | tests/test_training_loop.py | test_schedule_sums_to_total | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_schedule_custom_total | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_tired_user_gets_shorter_scenario | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_many_deaf_words_boosts_review | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_all_blocks_have_focus_text | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_plan_focus_prefers_weakest_hearing | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_plan_focus_includes_deaf_words | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_ungraduated_skills_listed | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_graduated_skill_excluded | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_summarize_day_empty | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_summarize_day_accuracy | 1 | 8a8035712758 |
| 6.4 | tests/test_training_loop.py | test_rebalance_never_loses_minutes | 1 | 8a8035712758 |

## Warnings

- duration_ms 为占位（本地全量跑 < 0.1s/用例），非精确计时。
- 语音 TTS/ASR 需真实 API Key，单测只覆盖纯逻辑与降级路径。

<!-- end-of-report -->
