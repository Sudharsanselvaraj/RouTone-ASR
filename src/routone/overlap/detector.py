"""Acoustic overlapping speech detection using multi-pitch harmonic analysis and spectral fluctuation."""

from __future__ import annotations
from typing import List, Dict, Any, Tuple
import numpy as np
import librosa

from routone.schemas.models import OverlapRegion


class OverlapDetector:
    """Estimates regions of overlapping speech in single-channel audio recordings."""

    def __init__(
        self,
        frame_length_ms: float = 30.0,
        hop_length_ms: float = 15.0,
        overlap_threshold: float = 0.35,
        min_overlap_duration_s: float = 0.30,
        merge_gap_s: float = 0.25
    ):
        self.frame_length_ms = frame_length_ms
        self.hop_length_ms = hop_length_ms
        self.overlap_threshold = overlap_threshold
        self.min_overlap_duration_s = min_overlap_duration_s
        self.merge_gap_s = merge_gap_s

    def compute_frame_features(self, audio: np.ndarray, sr: int = 16000) -> Tuple[np.ndarray, np.ndarray, Dict[str, np.ndarray]]:
        """Computes frame-level acoustic indicators of multiple concurrent speakers.

        Returns:
            Tuple of:
              - frame_times: np.ndarray of shape (num_frames,)
              - overlap_scores: np.ndarray in [0.0, 1.0]
              - feature_dict: dictionary of individual metric curves.
        """
        n_fft = int(sr * (self.frame_length_ms / 1000.0))
        hop_length = int(sr * (self.hop_length_ms / 1000.0))

        if len(audio) < n_fft:
            return np.array([0.0]), np.array([0.0]), {}

        # 1. Short-Time Energy & RMS
        rms = librosa.feature.rms(y=audio, frame_length=n_fft, hop_length=hop_length)[0]
        # Avoid silence
        silence_threshold = np.percentile(rms, 20) + 1e-6
        voiced_mask = rms > silence_threshold

        # 2. Spectral Flatness (overlap causes more noise-like, diffuse spectra)
        flatness = librosa.feature.spectral_flatness(y=audio, n_fft=n_fft, hop_length=hop_length)[0]

        # 3. Spectral Centroid variance (dynamic shifts when two speakers alternate/overlap)
        centroid = librosa.feature.spectral_centroid(y=audio, sr=sr, n_fft=n_fft, hop_length=hop_length)[0]
        centroid_delta = np.abs(np.diff(centroid, prepend=centroid[0])) / (np.max(centroid) + 1e-6)

        # 4. Zero Crossing Rate (ZCR)
        zcr = librosa.feature.zero_crossing_rate(y=audio, frame_length=n_fft, hop_length=hop_length)[0]

        # 5. Harmonic Multi-Pitch Clash Indicator
        # Compute short-term autocorrelation to detect secondary pitch peaks
        num_frames = len(rms)
        clash_scores = np.zeros(num_frames, dtype=np.float32)

        # Pitch search range: 80 Hz to 400 Hz
        min_lag = int(sr / 400.0)
        max_lag = int(sr / 80.0)

        for i in range(num_frames):
            if not voiced_mask[i]:
                continue
            start_samp = i * hop_length
            end_samp = start_samp + n_fft
            if end_samp > len(audio):
                break
            frame = audio[start_samp:end_samp]
            # Autocorrelation
            frame_win = frame * np.hanning(len(frame))
            corr = np.correlate(frame_win, frame_win, mode="full")
            corr = corr[len(frame_win) - 1 :]
            if len(corr) <= max_lag:
                continue

            search_region = corr[min_lag:max_lag]
            norm_factor = corr[0] + 1e-6
            norm_search = search_region / norm_factor

            # Find local peaks in autocorrelation with their lags
            peaks = []
            for k in range(1, len(norm_search) - 1):
                if norm_search[k] > norm_search[k - 1] and norm_search[k] > norm_search[k + 1] and norm_search[k] > 0.12:
                    actual_lag = min_lag + k
                    peaks.append((actual_lag, float(norm_search[k])))

            if len(peaks) >= 2:
                # Filter out single-speaker octave subharmonics (2x, 3x)
                peaks_sorted = sorted(peaks, key=lambda p: p[1], reverse=True)
                primary_lag, primary_val = peaks_sorted[0]
                clashing_peaks = []
                for sec_lag, sec_val in peaks_sorted[1:]:
                    ratio = max(primary_lag, sec_lag) / float(min(primary_lag, sec_lag))
                    if not (abs(ratio - 2.0) < 0.12 or abs(ratio - 3.0) < 0.15):
                        clashing_peaks.append(sec_val / (primary_val + 1e-6))

                if clashing_peaks:
                    clash_scores[i] = float(np.clip(max(clashing_peaks) * 1.25, 0.0, 1.0))

        # Composite calibrated overlap probability score
        # Combination weights: clash + spectral dispersion
        raw_score = (
            0.55 * clash_scores +
            0.15 * np.clip(flatness * 12.0, 0.0, 1.0) +
            0.15 * np.clip(centroid_delta * 5.0, 0.0, 1.0) +
            0.15 * np.clip(zcr * 4.0, 0.0, 1.0)
        )
        # Suppress non-voiced frames
        overlap_scores = raw_score * voiced_mask.astype(np.float32)
        overlap_scores = np.clip(overlap_scores, 0.0, 1.0)

        # Smooth using moving average filter (3 frames)
        if len(overlap_scores) >= 3:
            overlap_scores = np.convolve(overlap_scores, np.ones(3)/3.0, mode="same")

        frame_times = librosa.frames_to_time(np.arange(num_frames), sr=sr, hop_length=hop_length)

        feature_dict = {
            "rms": rms,
            "flatness": flatness,
            "clash_scores": clash_scores,
            "centroid_delta": centroid_delta,
            "zcr": zcr
        }

        return frame_times, overlap_scores, feature_dict

    def detect_overlaps(self, audio: np.ndarray, sr: int = 16000) -> List[OverlapRegion]:
        """Detects contiguous segments of multi-speaker overlapping speech.

        Args:
            audio: 1-D numpy float32 audio at 16,000 Hz.
            sr: Sample rate.

        Returns:
            List of OverlapRegion objects containing boundaries, scores, and speaker counts.
        """
        frame_times, scores, features = self.compute_frame_features(audio, sr=sr)
        if len(scores) == 0:
            return []

        import scipy.ndimage
        # Morphological envelope smoothing to bridge intra-syllabic pauses (approx 200ms)
        smooth_active_scores = scipy.ndimage.maximum_filter1d(scores, size=15)
        smooth_active_scores = scipy.ndimage.uniform_filter1d(smooth_active_scores, size=11)

        # Find raw candidate intervals exceeding threshold
        active = smooth_active_scores >= self.overlap_threshold
        raw_intervals: List[Tuple[float, float, float, float, float]] = []

        in_region = False
        start_t = 0.0
        region_scores = []
        clashes = []

        for i, is_act in enumerate(active):
            t = float(frame_times[i])
            if is_act and not in_region:
                in_region = True
                start_t = t
                region_scores = [float(scores[i])]
                clashes = [float(features.get("clash_scores", np.zeros(len(scores)))[i])]
            elif is_act and in_region:
                region_scores.append(float(scores[i]))
                clashes.append(float(features.get("clash_scores", np.zeros(len(scores)))[i]))
            elif not is_act and in_region:
                in_region = False
                end_t = t
                if (end_t - start_t) >= self.min_overlap_duration_s:
                    mean_score = float(np.mean(region_scores))
                    mean_clash = float(np.mean(clashes))
                    raw_intervals.append((start_t, end_t, mean_score, mean_clash, float(np.var(region_scores))))

        if in_region:
            end_t = float(frame_times[-1])
            if (end_t - start_t) >= self.min_overlap_duration_s:
                mean_score = float(np.mean(region_scores))
                mean_clash = float(np.mean(clashes))
                raw_intervals.append((start_t, end_t, mean_score, mean_clash, float(np.var(region_scores))))

        if not raw_intervals:
            return []

        # Merge intervals that are very close (less than merge_gap_s)
        merged: List[OverlapRegion] = []
        cur_start, cur_end, cur_score, cur_clash, cur_var = raw_intervals[0]
        acc_scores = [cur_score]

        for next_start, next_end, next_score, next_clash, next_var in raw_intervals[1:]:
            if next_start - cur_end <= self.merge_gap_s:
                cur_end = next_end
                acc_scores.append(next_score)
                cur_clash = max(cur_clash, next_clash)
            else:
                dur = round(cur_end - cur_start, 3)
                mean_s = round(float(np.mean(acc_scores)), 3)
                merged.append(
                    OverlapRegion(
                        region_id=f"ov_{len(merged)}",
                        start=round(cur_start, 3),
                        end=round(cur_end, 3),
                        duration=dur,
                        overlap_score=mean_s,
                        speaker_count_estimate=2,
                        snr_estimate_db=14.0,
                        energy_variance=round(cur_var, 4),
                        pitch_clash_index=round(cur_clash, 3)
                    )
                )
                cur_start, cur_end, cur_clash, cur_var = next_start, next_end, next_clash, next_var
                acc_scores = [next_score]

        # Append last
        dur = round(cur_end - cur_start, 3)
        mean_s = round(float(np.mean(acc_scores)), 3)
        merged.append(
            OverlapRegion(
                region_id=f"ov_{len(merged)}",
                start=round(cur_start, 3),
                end=round(cur_end, 3),
                duration=dur,
                overlap_score=mean_s,
                speaker_count_estimate=2,
                snr_estimate_db=14.0,
                energy_variance=round(cur_var, 4),
                pitch_clash_index=round(cur_clash, 3)
            )
        )

        return merged
