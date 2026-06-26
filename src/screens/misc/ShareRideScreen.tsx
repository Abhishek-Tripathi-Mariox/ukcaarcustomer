import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  StatusBar,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme';

interface ShareRideScreenProps {
  navigation: any;
}

interface RecentPerson {
  id: string;
  name: string;
  initials: string;
  color: string;
}

interface SocialApp {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  url: string;
}

const recentPeople: RecentPerson[] = [
  { id: '1', name: 'Charlotte\nHanlin', initials: 'CH', color: '#F4B4B4' },
  { id: '2', name: 'Kristin\nWatson', initials: 'KW', color: '#2C2D3A' },
  { id: '3', name: 'Clinton\nMcclure', initials: 'CM', color: '#7C5A3A' },
  { id: '4', name: 'Maryland\nWinkles', initials: 'MW', color: '#F4C97A' },
  { id: '5', name: 'Alex\nHern', initials: 'AH', color: '#9DDDE9' },
];

const socialApps: SocialApp[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366', url: 'whatsapp://send' },
  { id: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', url: 'fb://' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E4405F', url: 'instagram://' },
  { id: 'telegram', label: 'Telegram', icon: 'paper-plane', color: '#229ED9', url: 'tg://' },
  { id: 'x', label: 'X (For)', icon: 'logo-twitter', color: '#000000', url: 'twitter://' },
];

export const ShareRideScreen: React.FC<ShareRideScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const handleSystemShare = async () => {
    try {
      await Share.share({
        message:
          "I'm on my way! Track my UKCAAR ride: https://ukcaar.com/track/abc123",
        title: 'Share Ride Receipt',
      });
      navigation.goBack();
    } catch (error) {
      console.error(error);
    }
  };

  const handleSocialShare = async (app: SocialApp) => {
    try {
      const supported = await Linking.canOpenURL(app.url);
      if (supported) {
        await Linking.openURL(app.url);
      } else {
        handleSystemShare();
      }
    } catch {
      handleSystemShare();
    }
  };

  return (
    <View style={styles.overlay}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={() => navigation.goBack()} />

      {/* Sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        <Text style={styles.title}>Share Receipt</Text>

        {/* File row */}
        <View style={styles.fileRow}>
          <View style={styles.fileThumb}>
            <Ionicons name="image" size={22} color={Colors.white} />
          </View>
          <Text style={styles.fileName} numberOfLines={1}>
            IMG-TRX1221240956-BKG926084.jpg
          </Text>
        </View>

        {/* Recent people */}
        <Text style={styles.sectionLabel}>Recent people</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.peopleRow}
        >
          {recentPeople.map((person) => (
            <TouchableOpacity
              key={person.id}
              style={styles.personItem}
              activeOpacity={0.8}
              onPress={handleSystemShare}
            >
              <View style={[styles.personAvatar, { backgroundColor: person.color }]}>
                <Text style={styles.personInitials}>{person.initials}</Text>
              </View>
              <Text style={styles.personName} numberOfLines={2}>
                {person.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Social media */}
        <Text style={styles.sectionLabel}>Social media</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.socialRow}
        >
          {socialApps.map((app) => (
            <TouchableOpacity
              key={app.id}
              style={styles.socialItem}
              activeOpacity={0.8}
              onPress={() => handleSocialShare(app)}
            >
              <View style={[styles.socialIcon, { backgroundColor: app.color }]}>
                <Ionicons name={app.icon} size={28} color={Colors.white} />
              </View>
              <Text style={styles.socialLabel} numberOfLines={1}>
                {app.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 20, 20, 0.5)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E5E5',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#0D1217',
    textAlign: 'center',
    marginBottom: 18,
  },

  /* File row */
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    marginBottom: 22,
  },
  fileThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0DC386',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#2C2D3A',
  },

  /* Section labels */
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#686A8A',
    marginBottom: 12,
  },

  /* People */
  peopleRow: {
    paddingBottom: 4,
    gap: 18,
    marginBottom: 4,
    paddingRight: 8,
  },
  personItem: {
    width: 64,
    alignItems: 'center',
  },
  personAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  personInitials: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: Colors.white,
  },
  personName: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#2C2D3A',
    textAlign: 'center',
    lineHeight: 13,
  },

  /* Social */
  socialRow: {
    paddingTop: 8,
    paddingBottom: 4,
    gap: 18,
    paddingRight: 8,
  },
  socialItem: {
    width: 64,
    alignItems: 'center',
  },
  socialIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  socialLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: '#2C2D3A',
    textAlign: 'center',
  },
});
