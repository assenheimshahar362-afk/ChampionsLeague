/**
 * Database types.
 *
 * PLACEHOLDER — hand-written to match supabase/migrations/*.sql so the app is
 * fully typed before a Supabase project exists. Once one does, replace this
 * file wholesale with generated output and never edit it by hand again:
 *
 *   npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
 *
 * The shape below intentionally mirrors the generator's output so the swap is a
 * drop-in.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Mirrors public.fixture_stage — and the `Stage` union in lib/fixtures/types.ts. */
export type FixtureStageEnum =
  | "league_phase"
  | "playoff"
  | "r16"
  | "qf"
  | "sf"
  | "final";

/** Mirrors public.fixture_status — and `FixtureStatus` in lib/fixtures/types.ts. */
export type FixtureStatusEnum =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled";

export type GroupMemberRoleEnum = "member" | "manager";
export type GroupJoinRequestStatusEnum =
  | "pending_payment"
  | "approved"
  | "declined";

export type Database = {
  public: {
    Tables: {
      game_settings: {
        Row: {
          id: number;
          exact_points: number;
          outcome_points: number;
          rules_note_en: string;
          rules_note_he: string;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          exact_points?: number;
          outcome_points?: number;
          rules_note_en?: string;
          rules_note_he?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          exact_points?: number;
          outcome_points?: number;
          rules_note_en?: string;
          rules_note_he?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          favorite_team_id: string | null;
          locale: string;
          nickname_confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          favorite_team_id?: string | null;
          locale?: string;
          nickname_confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          favorite_team_id?: string | null;
          locale?: string;
          nickname_confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      groups: {
        Row: {
          id: string;
          name: string;
          image_url: string | null;
          entry_fee_agorot: number;
          invite_code: string;
          created_by: string;
          bit_payment_url: string | null;
          paybox_payment_url: string | null;
          payment_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          image_url?: string | null;
          entry_fee_agorot?: number;
          invite_code?: string;
          created_by: string;
          bit_payment_url?: string | null;
          paybox_payment_url?: string | null;
          payment_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          image_url?: string | null;
          entry_fee_agorot?: number;
          invite_code?: string;
          created_by?: string;
          bit_payment_url?: string | null;
          paybox_payment_url?: string | null;
          payment_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          role: GroupMemberRoleEnum;
          joined_at: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
          role?: GroupMemberRoleEnum;
          joined_at?: string;
        };
        Update: {
          group_id?: string;
          user_id?: string;
          role?: GroupMemberRoleEnum;
          joined_at?: string;
        };
        Relationships: [];
      };

      group_join_requests: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          status: GroupJoinRequestStatusEnum;
          requested_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          status?: GroupJoinRequestStatusEnum;
          requested_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          status?: GroupJoinRequestStatusEnum;
          requested_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Relationships: [];
      };

      teams: {
        Row: {
          id: string;
          api_football_id: number | null;
          football_data_id: number | null;
          name: string;
          short_name: string;
          code: string;
          color: string;
          country: string;
          logo_url: string | null;
          venue_name: string | null;
          venue_city: string | null;
          venue_capacity: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          api_football_id?: number | null;
          football_data_id?: number | null;
          name: string;
          short_name: string;
          code: string;
          color: string;
          country: string;
          logo_url?: string | null;
          venue_name?: string | null;
          venue_city?: string | null;
          venue_capacity?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          api_football_id?: number | null;
          football_data_id?: number | null;
          name?: string;
          short_name?: string;
          code?: string;
          color?: string;
          country?: string;
          logo_url?: string | null;
          venue_name?: string | null;
          venue_city?: string | null;
          venue_capacity?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      team_squad_players: {
        Row: {
          season: number;
          team_id: string;
          source: string;
          source_player_id: string;
          football_data_id: number | null;
          name: string;
          position: string | null;
          shirt_number: number | null;
          nationality: string | null;
          date_of_birth: string | null;
          photo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          season: number;
          team_id: string;
          source?: string;
          source_player_id: string;
          football_data_id?: number | null;
          name: string;
          position?: string | null;
          shirt_number?: number | null;
          nationality?: string | null;
          date_of_birth?: string | null;
          photo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          season?: number;
          team_id?: string;
          source?: string;
          source_player_id?: string;
          football_data_id?: number | null;
          name?: string;
          position?: string | null;
          shirt_number?: number | null;
          nationality?: string | null;
          date_of_birth?: string | null;
          photo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      season_team_candidates: {
        Row: {
          season: number;
          candidate_id: number;
          football_data_id: number | null;
          team_id: string | null;
          name_en: string;
          name_he: string;
          logo_url: string | null;
          implied_probability: number;
          pick_points: number;
          rank: number;
          created_at: string;
        };
        Insert: {
          season: number;
          candidate_id?: number;
          football_data_id?: number | null;
          team_id?: string | null;
          name_en: string;
          name_he: string;
          logo_url?: string | null;
          implied_probability: number;
          pick_points: number;
          rank: number;
          created_at?: string;
        };
        Update: {
          season?: number;
          candidate_id?: number;
          football_data_id?: number | null;
          team_id?: string | null;
          name_en?: string;
          name_he?: string;
          logo_url?: string | null;
          implied_probability?: number;
          pick_points?: number;
          rank?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      season_player_candidates: {
        Row: {
          season: number;
          candidate_id: number;
          football_data_id: number | null;
          name_en: string;
          name_he: string;
          photo_url: string | null;
          team_id: string | null;
          team_name_en: string;
          team_name_he: string;
          position: string | null;
          source_goals: number;
          source_assists: number;
          source_rating: number | null;
          implied_probability: number;
          pick_points: number;
          rank: number;
          created_at: string;
        };
        Insert: {
          season: number;
          candidate_id?: number;
          football_data_id?: number | null;
          name_en: string;
          name_he: string;
          photo_url?: string | null;
          team_id?: string | null;
          team_name_en: string;
          team_name_he: string;
          position?: string | null;
          source_goals?: number;
          source_assists?: number;
          source_rating?: number | null;
          implied_probability: number;
          pick_points: number;
          rank: number;
          created_at?: string;
        };
        Update: {
          season?: number;
          candidate_id?: number;
          football_data_id?: number | null;
          name_en?: string;
          name_he?: string;
          photo_url?: string | null;
          team_id?: string | null;
          team_name_en?: string;
          team_name_he?: string;
          position?: string | null;
          source_goals?: number;
          source_assists?: number;
          source_rating?: number | null;
          implied_probability?: number;
          pick_points?: number;
          rank?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      season_picks: {
        Row: {
          id: string;
          user_id: string;
          season: number;
          champion_candidate_id: number;
          top_scorer_candidate_id: number;
          champion_pick_points: number;
          scorer_pick_points: number;
          champion_awarded_points: number;
          scorer_awarded_points: number;
          settled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          season: number;
          champion_candidate_id: number;
          top_scorer_candidate_id: number;
          champion_pick_points?: number;
          scorer_pick_points?: number;
          champion_awarded_points?: number;
          scorer_awarded_points?: number;
          settled_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          season?: number;
          champion_candidate_id?: number;
          top_scorer_candidate_id?: number;
          champion_pick_points?: number;
          scorer_pick_points?: number;
          champion_awarded_points?: number;
          scorer_awarded_points?: number;
          settled_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      season_outcomes: {
        Row: {
          season: number;
          champion_team_id: string;
          top_scorer_football_data_ids: number[];
          released_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          season: number;
          champion_team_id: string;
          top_scorer_football_data_ids: number[];
          released_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          season?: number;
          champion_team_id?: string;
          top_scorer_football_data_ids?: number[];
          released_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      fixtures: {
        Row: {
          id: string;
          api_football_id: number | null;
          football_data_id: number | null;
          season: number;
          stage: FixtureStageEnum;
          round: string;
          matchday: number | null;
          kickoff_at: string;
          original_kickoff_at: string;
          venue: string | null;
          venue_api_id: number | null;
          venue_city: string | null;
          venue_address: string | null;
          venue_capacity: number | null;
          venue_surface: string | null;
          venue_image_url: string | null;
          referee: string | null;
          attendance: number | null;
          home_team_id: string;
          away_team_id: string;
          status: FixtureStatusEnum;
          home_goals: number | null;
          away_goals: number | null;
          went_to_extra_time: boolean;
          elapsed_minutes: number | null;
          odds_home: number | null;
          odds_draw: number | null;
          odds_away: number | null;
          prob_home: number | null;
          prob_draw: number | null;
          prob_away: number | null;
          home_win_points: number;
          draw_points: number;
          away_win_points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          api_football_id?: number | null;
          football_data_id?: number | null;
          season: number;
          stage: FixtureStageEnum;
          round: string;
          matchday?: number | null;
          kickoff_at: string;
          original_kickoff_at: string;
          venue?: string | null;
          venue_api_id?: number | null;
          venue_city?: string | null;
          venue_address?: string | null;
          venue_capacity?: number | null;
          venue_surface?: string | null;
          venue_image_url?: string | null;
          referee?: string | null;
          attendance?: number | null;
          home_team_id: string;
          away_team_id: string;
          status?: FixtureStatusEnum;
          home_goals?: number | null;
          away_goals?: number | null;
          went_to_extra_time?: boolean;
          elapsed_minutes?: number | null;
          odds_home?: number | null;
          odds_draw?: number | null;
          odds_away?: number | null;
          prob_home?: number | null;
          prob_draw?: number | null;
          prob_away?: number | null;
          home_win_points?: number;
          draw_points?: number;
          away_win_points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          api_football_id?: number | null;
          football_data_id?: number | null;
          season?: number;
          stage?: FixtureStageEnum;
          round?: string;
          matchday?: number | null;
          kickoff_at?: string;
          original_kickoff_at?: string;
          venue?: string | null;
          venue_api_id?: number | null;
          venue_city?: string | null;
          venue_address?: string | null;
          venue_capacity?: number | null;
          venue_surface?: string | null;
          venue_image_url?: string | null;
          referee?: string | null;
          attendance?: number | null;
          home_team_id?: string;
          away_team_id?: string;
          status?: FixtureStatusEnum;
          home_goals?: number | null;
          away_goals?: number | null;
          went_to_extra_time?: boolean;
          elapsed_minutes?: number | null;
          odds_home?: number | null;
          odds_draw?: number | null;
          odds_away?: number | null;
          prob_home?: number | null;
          prob_draw?: number | null;
          prob_away?: number | null;
          home_win_points?: number;
          draw_points?: number;
          away_win_points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      fixture_details: {
        Row: {
          fixture_id: string;
          provider_status: FixtureStatusEnum;
          payload: Json;
          fetched_at: string;
        };
        Insert: {
          fixture_id: string;
          provider_status: FixtureStatusEnum;
          payload: Json;
          fetched_at?: string;
        };
        Update: {
          fixture_id?: string;
          provider_status?: FixtureStatusEnum;
          payload?: Json;
          fetched_at?: string;
        };
        Relationships: [];
      };

      provider_poll_state: {
        Row: {
          job: string;
          last_requested_at: string;
        };
        Insert: {
          job: string;
          last_requested_at?: string;
        };
        Update: {
          job?: string;
          last_requested_at?: string;
        };
        Relationships: [];
      };

      fixture_results: {
        Row: {
          fixture_id: string;
          status: FixtureStatusEnum;
          home_goals: number | null;
          away_goals: number | null;
          went_to_extra_time: boolean;
          elapsed_minutes: number | null;
          released_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          fixture_id: string;
          status: FixtureStatusEnum;
          home_goals?: number | null;
          away_goals?: number | null;
          went_to_extra_time?: boolean;
          elapsed_minutes?: number | null;
          released_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          fixture_id?: string;
          status?: FixtureStatusEnum;
          home_goals?: number | null;
          away_goals?: number | null;
          went_to_extra_time?: boolean;
          elapsed_minutes?: number | null;
          released_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      predictions: {
        Row: {
          id: string;
          user_id: string;
          fixture_id: string;
          home_goals: number;
          away_goals: number;
          is_joker: boolean;
          fixture_round: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fixture_id: string;
          home_goals: number;
          away_goals: number;
          is_joker?: boolean;
          /** Set by the predictions_set_round trigger; never sent by clients. */
          fixture_round?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          fixture_id?: string;
          home_goals?: number;
          away_goals?: number;
          is_joker?: boolean;
          fixture_round?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      prediction_scores: {
        Row: {
          prediction_id: string;
          user_id: string;
          fixture_id: string;
          base_points: number;
          correct_outcome: boolean;
          correct_goal_difference: boolean;
          exact_score: boolean;
          difficulty_multiplier: number;
          stage_multiplier: number;
          joker_multiplier: number;
          total_points: number;
          breakdown: Json;
          settled_at: string;
        };
        Insert: {
          prediction_id: string;
          user_id: string;
          fixture_id: string;
          base_points: number;
          correct_outcome: boolean;
          correct_goal_difference: boolean;
          exact_score: boolean;
          difficulty_multiplier: number;
          stage_multiplier: number;
          joker_multiplier: number;
          total_points: number;
          breakdown: Json;
          settled_at?: string;
        };
        Update: {
          prediction_id?: string;
          user_id?: string;
          fixture_id?: string;
          base_points?: number;
          correct_outcome?: boolean;
          correct_goal_difference?: boolean;
          exact_score?: boolean;
          difficulty_multiplier?: number;
          stage_multiplier?: number;
          joker_multiplier?: number;
          total_points?: number;
          breakdown?: Json;
          settled_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      claim_football_data_live_poll: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      current_season_pick_state: {
        Args: Record<never, never>;
        Returns: {
          season: number;
          revealed: boolean;
        }[];
      };
      get_visible_leaderboard_season_picks: {
        Args: Record<never, never>;
        Returns: {
          user_id: string;
          season: number;
          champion_awarded_points: number;
          scorer_awarded_points: number;
          settled_at: string | null;
          champion_name_en: string;
          champion_name_he: string;
          champion_logo_url: string | null;
          scorer_name_en: string;
          scorer_name_he: string;
          scorer_photo_url: string | null;
        }[];
      };
      admin_set_game_settings: {
        Args: {
          new_exact_points: number;
          new_outcome_points: number;
          new_rules_note_en: string;
          new_rules_note_he: string;
          admin_user_id: string;
        };
        Returns: undefined;
      };
      admin_set_team_candidate_points: {
        Args: {
          target_season: number;
          target_candidate_id: number;
          new_points: number;
        };
        Returns: undefined;
      };
      admin_set_player_candidate_points: {
        Args: {
          target_season: number;
          target_candidate_id: number;
          new_points: number;
        };
        Returns: undefined;
      };
      season_picks_are_open: {
        Args: {
          target_season: number;
        };
        Returns: boolean;
      };
      save_my_season_pick: {
        Args: {
          target_season: number;
          target_champion_candidate_id: number;
          target_top_scorer_candidate_id: number;
        };
        Returns: undefined;
      };
    };
    Enums: {
      fixture_stage: FixtureStageEnum;
      fixture_status: FixtureStatusEnum;
      group_member_role: GroupMemberRoleEnum;
      group_join_request_status: GroupJoinRequestStatusEnum;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type TeamRecord = Database["public"]["Tables"]["teams"]["Row"];
export type TeamSquadPlayerRecord =
  Database["public"]["Tables"]["team_squad_players"]["Row"];
export type FixtureRecord = Database["public"]["Tables"]["fixtures"]["Row"];
